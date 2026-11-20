# Informe de Seguridad — Integrante 1: Autenticación, Sesiones, Hashing y Fuerza Bruta

**Proyecto:** Cafetería Origen (Programación IV — Redes y Seguridad)  
**Eje de trabajo:** Autenticación, Gestión de Sesiones, Hashing de Contraseñas y Protección contra Fuerza Bruta  
**Fallas abordadas:** `#1`, `#5` (parcial en login), `#11`, `#12`, `#13`, `#14`, `#15`, `#16`, `#17`  
**Controles del checklist cubiertos:** `SQLI-01` (en `usuarios.service.ts`), `XSS-02` (en `auth.routes.ts`), `CSRF-02`, `AUTH-01` a `AUTH-13`

---

## 1. Falla #1 — Inyección SQL en el Login

### Qué es y por qué importa
La **Inyección SQL (SQLi)** ocurre cuando los datos enviados por el usuario se concatenan directamente dentro de una sentencia SQL sin separación entre el código de la consulta y los datos. En el endpoint de inicio de sesión, esta vulnerabilidad es crítica porque permite eludir por completo la autenticación e ingresar como cualquier usuario (incluido el administrador) sin conocer su contraseña.

### Dónde estaba
- **Archivo:** `src/services/usuarios.service.ts` (función `autenticar`, línea 42 original).

### Cómo se observa (pruebas manuales en `localhost`)
1. Abrir el panel en `http://localhost:8080/admin.html`.
2. En el campo **Usuario**, ingresar `' OR 1=1 --` y en **Contraseña** escribir cualquier valor (`cualquiera`).
3. La consulta resultante ejecutada por PostgreSQL pasa a ser:
   ```sql
   SELECT * FROM usuarios WHERE username = '' OR 1=1 --' AND password = '...'
   ```
   Como `1=1` es siempre verdadero y `--` comenta el resto de la condición, la base devuelve la primera fila de la tabla `usuarios` (`admin`) y el sistema inicia sesión como administrador.
4. De igual forma, ingresando `admin'--` como usuario se comenta la verificación de contraseña y se accede directamente a la cuenta `admin`.

### Por qué ocurría
Porque la función `autenticar` construía la cadena SQL mediante interpolación de plantillas (`template literals`):
```ts
const sql = `SELECT * FROM usuarios WHERE username = '${username}' AND password = '${password}'`;
const { rows } = await db.query<Usuario>(sql);
```

### Cómo se corrigió
Se reemplazó la concatenación por una **consulta parametrizada** utilizando marcadores posicionales (`$1`) de `pg`, delegando la comparación de la contraseña a `bcrypt.compare`:
```ts
export async function autenticar(username: string, password: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(
    'SELECT * FROM usuarios WHERE username = $1',
    [username]
  );
  const usuario = rows[0];
  if (!usuario) return null;

  const coincide = await bcrypt.compare(password, usuario.password);
  return coincide ? usuario : null;
}
```

### Cómo se verifica
- **Tests automáticos:** `el login NO acepta el bypass con payload SQL` y `el login NO acepta el payload que comenta la contraseña` en `tests/seguridad-login.test.ts`.
- **Checklist estático:** controles `SQLI-01`, `SQLI-02` y `AUTH-03` en `npm run check:security`.

---

## 2. Falla #11 — Contraseñas en Texto Plano y Credenciales por Defecto

### Qué es y por qué importa
El almacenamiento de contraseñas en texto plano implica que cualquier filtración de la base de datos (mediante un backup expuesto, acceso a logs o una inyección SQL como `UNION SELECT` en reportes) expone inmediatamente todas las claves de los usuarios. Asimismo, mantener credenciales triviales de fábrica como `admin/admin` o `cliente/cliente` facilita el acceso no autorizado inmediato.

### Dónde estaba
- **Archivos:**
  - `src/inicializar.ts` (líneas 21–64 originales): definición de `USUARIOS_INICIALES` con claves triviales (`admin`, `cliente`) e inserción directa sin hash.
  - `src/services/usuarios.service.ts` (líneas 40–45 y 77–83 originales): comparación en texto plano en `autenticar` y guardado en texto plano en `cambiarPassword` y `actualizar`.
  - `src/config.ts` (líneas 36–39 originales): `credencialesPorDefecto` con contraseña `'admin'`.

### Cómo se observa (pruebas manuales en `localhost`)
1. Ejecutar en la terminal local:
   ```bash
   docker compose exec db psql -U postgres -d origen -c "SELECT username, password FROM usuarios;"
   ```
2. Se observaban las contraseñas legibles a simple vista (`admin | admin`, `valentina | origen2024`, `barista | cafe123`, etc.).
3. Ingresar en el panel con `admin` / `admin` permitía acceso administrativo con credenciales por defecto triviales.

### Por qué ocurría
Porque `inicializarBase()` insertaba `usuario.password` directamente en la tabla `usuarios` sin aplicar ninguna función de derivación/hashing criptográfico, y `usuarios.service.ts` guardaba y comparaba cadenas planas.

### Cómo se corrigió
1. Se incorporó `bcryptjs` con un factor de costo (`SALT_ROUNDS = 12`) en `src/inicializar.ts` para hashear las contraseñas al inicializar la base y actualizar registros previos en texto plano (`ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password`).
2. Se reemplazaron las credenciales triviales de fábrica (`admin/admin` y `cliente/cliente`) por valores configurables por entorno o contraseñas robustas (`Admin_Origen2024!`, `Cliente_Origen2024!`).
3. En `src/services/usuarios.service.ts`, se utilizó `bcrypt.compare(password, usuario.password)` para autenticar y `bcrypt.hash(nuevaPassword, SALT_ROUNDS)` en `cambiarPassword` y `actualizar`.

### Cómo se verifica
- **Tests automáticos:** `las contraseñas NO se guardan en texto plano` en `tests/seguridad.test.ts` (comprueba que todas las filas de `usuarios` tengan formato bcrypt `^\$2[aby]\$\d{2}\$`).
- **Checklist estático:** controles `AUTH-01`, `AUTH-02`, `AUTH-03` y `AUTH-13` en `npm run check:security`.

---

## 3. Falla #17 y parte de #5 — Enumeración de Usuarios y XSS Reflejado en Error de Login

### Qué es y por qué importa
La **enumeración de usuarios** ocurre cuando la aplicación responde de forma diferente según si el nombre de usuario existe o no en la base de datos. Esto permite a un atacante confeccionar una lista de cuentas válidas antes de lanzar ataques de diccionario. Además, al reflejar el `username` enviado dentro del mensaje de error sin sanitizar (`El usuario "${username}" no existe en el sistema.`), si el cliente inserta ese mensaje con `innerHTML`, se produce **Cross-Site Scripting (XSS) reflejado**.

### Dónde estaba
- **Archivo:** `src/routes/auth.routes.ts` (líneas 29–40 originales).

### Cómo se observa (pruebas manuales en `localhost`)
1. En el formulario de login, enviar un usuario inexistente (`fantasma`) con cualquier clave: la API devolvía `401` con `{"error": "El usuario \"fantasma\" no existe en el sistema."}`.
2. Enviar un usuario existente (`valentina`) con clave errónea: la API devolvía `401` con `{"error": "La contraseña es incorrecta."}`.
3. Enviar como usuario `<img src=x onerror=alert(1)>`: el servidor reflejaba la etiqueta HTML cruda dentro del JSON de error.

### Por qué ocurría
Cuando `usuarios.autenticar` devolvía `null`, la ruta consultaba `usuarios.buscarPorUsername(username)` para distinguir ambos casos e interpolaba `username` en la cadena de error.

### Cómo se corrigió
Se eliminó la segunda consulta y se unificó la respuesta de fallo de autenticación en un único mensaje genérico que no revela si falló el usuario o la contraseña ni refleja la entrada del cliente:
```ts
if (!usuario) {
  return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
}
```

### Cómo se verifica
- **Tests automáticos:**
  - `los mensajes de login son genéricos (sin enumeración de usuarios)` en `tests/seguridad-login.test.ts`.
  - `el login NO devuelve HTML sin escapar en el mensaje de error` en `tests/seguridad.test.ts`.
- **Checklist estático:** controles `AUTH-12` y `XSS-02` (en `auth.routes.ts`).

---

## 4. Falla #12 — Ausencia de Protección contra Fuerza Bruta

### Qué es y por qué importa
Sin un límite en la tasa de intentos de inicio de sesión, un atacante puede probar miles de contraseñas por minuto contra una cuenta hasta adivinarla, o abusar del costo computacional de `bcrypt` para degradar el servicio.

### Dónde estaba
- **Archivo:** `src/routes/auth.routes.ts` (definición de `router.post('/login', ...)` en línea 18 original).

### Cómo se observa (pruebas manuales en `localhost`)
1. Desde la interfaz de login en `http://localhost:8080/admin.html`, realizar manualmente múltiples intentos fallidos consecutivos (> 5 intentos) con contraseñas erróneas.
2. En la versión vulnerable, el servidor respondía indefinidamente `401 Unauthorized` sin aplicar ningún bloqueo temporal (`429 Too Many Requests`).

### Por qué ocurría
El endpoint `POST /api/auth/login` carecía de un middleware de limitación de tasa (*rate limiting*).

### Cómo se corrigió
Se configuró `express-rate-limit` sobre `/api/auth/login` permitiendo un máximo de 5 intentos fallidos por ventana de 15 minutos por IP, utilizando `skipSuccessfulRequests: true` para no penalizar los inicios de sesión exitosos:
```ts
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intentá nuevamente más tarde.' },
});

router.post('/login', limitadorLogin, async (req, res, next) => { ... });
```

### Cómo se verifica
- **Tests automáticos:** `el login bloquea o limita los intentos repetidos` y `el login correcto sigue funcionando después de un bloqueo` en `tests/seguridad-fuerza-bruta.test.ts`.
- **Checklist estático:** control `AUTH-04` en `npm run check:security`.

---

## 5. Falla #14 — Identificador de Sesión Predecible

### Qué es y por qué importa
Un identificador de sesión secuencial o predecible permite que cualquier usuario adivine el `sid` de otra sesión activa (por ejemplo, probando `sesion_1`, `sesion_2`, `sesion_3`) y secuestre la cuenta de otro usuario (*Session Hijacking*) sin necesidad de conocer sus credenciales.

### Dónde estaba
- **Archivo:** `src/middleware/sesion.ts` (líneas 30 y 49–52 originales).

### Cómo se observa (pruebas manuales en `localhost`)
1. Iniciar sesión en el panel y abrir **DevTools → Application → Cookies → `http://localhost:8080`**.
2. Observar el valor de la cookie `sid`: `sesion_1`.
3. Cerrar sesión y volver a ingresar: el valor pasa a ser `sesion_2`. Cualquier cliente que modifique manualmente su cookie `sid` a `sesion_1` toma el control de la primera sesión.

### Por qué ocurría
Se utilizaba un contador numérico incremental (`contadorSesiones += 1`) concatenado al prefijo `sesion_`:
```ts
let contadorSesiones = 0;
// ...
contadorSesiones += 1;
const id = `sesion_${contadorSesiones}`;
```

### Cómo se corrigió
Se eliminó el contador y se utilizó el generador criptográficamente seguro de Node.js (`crypto.randomBytes(32).toString('hex')`), produciendo identificadores de 256 bits de entropía (64 caracteres hexadecimales):
```ts
const id = crypto.randomBytes(32).toString('hex');
```

### Cómo se verifica
- **Tests automáticos:** `el identificador de sesión es aleatorio y no predecible` en `tests/seguridad.test.ts`.
- **Checklist estático:** controles `AUTH-07` y `AUTH-08` en `npm run check:security`.

---

## 6. Falla #15 — Sesiones sin Expiración y Fijación de Sesión en Login

### Qué es y por qué importa
Si las sesiones nunca caducan (`expiraEn: null`), una cookie olvidada en un equipo compartido o interceptada permanece válida indefinidamente. Además, si al autenticarse no se invalida la sesión previa asociada a la petición, la aplicación es vulnerable a **fijación de sesión** (*Session Fixation*).

### Dónde estaba
- **Archivo:** `src/middleware/sesion.ts` (líneas 48–73 originales).

### Cómo se observa (pruebas manuales en `localhost`)
1. Inspeccionando el almacén de sesiones en `src/middleware/sesion.ts`, cada sesión se creaba con `expiraEn: null` y `obtenerSesion()` nunca verificaba tiempos de vida.
2. Si un navegador ya enviaba una cookie `sid` antes de hacer login, la sesión anterior no se eliminaba del mapa del servidor.

### Por qué ocurría
No existían constantes de TTL por inactividad ni de vida máxima absoluta, ni validación de vencimiento al recuperar la sesión en `obtenerSesion()`.

### Cómo se corrigió
1. Se definieron `TTL_SESION_MS = 30 * 60 * 1000` (30 minutos de inactividad) y `MAX_VIDA_MS = 8 * 60 * 60 * 1000` (8 horas de vida máxima absoluta).
2. En `crearSesion()`, se invoca primero `destruirSesion(req)` para invalidar cualquier sesión previa y regenerar un identificador limpio, asignando `expiraEn: Date.now() + TTL_SESION_MS`.
3. En `obtenerSesion()`, se verifica que la sesión no haya superado ni el TTL de inactividad ni la vida máxima absoluta; si venció, se elimina de `sesiones` y se retorna `null`. Si sigue activa, se renueva su `expiraEn` (*rolling expiration*).

### Cómo se verifica
- **Checklist estático:** controles `AUTH-09` y `AUTH-10` en `npm run check:security`.
- **Tests funcionales y de seguridad:** `tests/auth.test.ts` y `tests/seguridad.test.ts`.

---

## 7. Falla #13 — Cookie de Sesión sin `HttpOnly`, `Secure` ni `SameSite`

### Qué es y por qué importa
Las directivas de seguridad de la cookie de sesión protegen el identificador frente a distintos vectores:
- **`HttpOnly`**: impide que scripts en el navegador accedan a la cookie mediante `document.cookie`, mitigando el robo de sesión ante un eventual XSS.
- **`Secure`**: asegura que en entornos de producción la cookie sólo viaje sobre conexiones cifradas (HTTPS).
- **`SameSite: 'lax'`**: evita que el navegador adjunte la cookie en peticiones cross-site de terceros, actuando como defensa frente a CSRF.

### Dónde estaba
- **Archivo:** `src/middleware/sesion.ts` (línea 62 original).

### Cómo se observa (pruebas manuales en `localhost`)
1. Iniciar sesión y abrir **DevTools → Application → Cookies**.
2. En la fila de la cookie `sid`, las columnas `HttpOnly`, `Secure` y `SameSite` aparecían vacías/desmarcadas.
3. En la consola del navegador, al escribir `document.cookie` se podía leer `'sid=...'` directamente desde JavaScript.

### Por qué ocurría
La cookie se emitía únicamente con `{ path: '/' }`:
```ts
res.cookie('sid', id, { path: '/' });
```

### Cómo se corrigió
Se configuraron los atributos de seguridad en `res.cookie`, activando `secure` según el entorno (`process.env.NODE_ENV === 'production'`) para mantener la funcionalidad sobre HTTP en `localhost` durante el desarrollo y las pruebas:
```ts
res.cookie('sid', id, {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: TTL_SESION_MS,
});
```

### Cómo se verifica
- **Tests automáticos:** `la cookie de sesión lleva HttpOnly, Secure y SameSite` en `tests/seguridad.test.ts`.
- **Checklist estático:** controles `AUTH-05`, `AUTH-06` y `CSRF-02` en `npm run check:security`.

---

## 8. Falla #16 — El Logout no Invalida la Sesión en el Servidor

### Qué es y por qué importa
Cuando el cierre de sesión únicamente borra la cookie en el navegador del cliente pero conserva la sesión activa en la memoria o base de datos del servidor, cualquier copia previa del identificador de sesión sigue siendo plenamente funcional para operar en nombre del usuario.

### Dónde estaba
- **Archivo:** `src/routes/auth.routes.ts` (líneas 69–72 originales).

### Cómo se observa (pruebas manuales en `localhost`)
1. Iniciar sesión y copiar el valor de la cookie `sid`.
2. Ejecutar `POST /api/auth/logout`.
3. Consultar `GET /api/auth/yo` enviando manualmente la cabecera `Cookie: sid=<valor_copiado>`: el servidor seguía respondiendo `200 OK` con los datos del usuario en lugar de `401 Unauthorized`.

### Por qué ocurría
El handler de `/logout` llamaba a `res.clearCookie('sid', { path: '/' })`, pero nunca invocaba a `destruirSesion(req)` (a pesar de que la función ya estaba importada en el archivo).

### Cómo se corrigió
Se invocó `destruirSesion(req)` antes de limpiar la cookie en el cliente:
```ts
router.post('/logout', (req, res) => {
  destruirSesion(req);
  res.clearCookie('sid', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ mensaje: 'Sesión cerrada.' });
});
```

### Cómo se verifica
- **Tests automáticos:** `el logout invalida la sesión en el servidor` en `tests/seguridad.test.ts`.
- **Checklist estático:** control `AUTH-11` en `npm run check:security`.

---

## 9. Reflexión Final — ¿Qué habría que hacer distinto en un proyecto real?

El análisis y corrección de las vulnerabilidades de autenticación y sesiones en **Cafetería Origen** deja lecciones fundamentales para el desarrollo de aplicaciones web en producción:

1. **La seguridad no puede agregarse al final como un parche:** Que los tests funcionales (`npm test`) estén en verde sólo demuestra que el camino feliz del negocio funciona, pero no dice nada sobre cómo reacciona el sistema ante entradas maliciosas. Incorporar baterías de pruebas de seguridad (`npm run test:seguridad`) y análisis estático (`npm run check:security`) en el pipeline de integración continua evita que errores como una concatenación SQL o una cookie sin `HttpOnly` lleguen a producción.
2. **Separación estricta entre código y datos:** Ninguna entrada del usuario debe concatenarse jamás en una consulta SQL. El uso sistemático de consultas parametrizadas (`$1, $2`) debe ser una convención innegociable en toda la capa de acceso a datos.
3. **Defensa en profundidad en el ciclo de vida de credenciales y sesiones:** La autenticación segura no depende de una sola medida, sino de varias capas complementarias:
   - Contraseñas hasheadas con algoritmos lentos y adaptativos (`bcrypt`, `Argon2`) y sin credenciales por defecto predecibles.
   - Respuestas de error uniformes y limitación de intentos (*rate limiting*) para frenar tanto la enumeración de cuentas como los ataques de fuerza bruta.
   - Identificadores de sesión generados con entropía criptográfica (`crypto.randomBytes`), con expiración acotada (por inactividad y absoluta), regenerados en cada login, protegidos en transporte y navegador (`HttpOnly`, `Secure`, `SameSite`) e invalidados efectivamente en el servidor al cerrar sesión.
