# Informe de Seguridad — Integrante 2: SQL Injection, Validación de Entradas e Infraestructura

**Proyecto:** Cafetería Origen — Programación IV, TP4 de Ciberseguridad  
**Eje de trabajo:** SQLi en catálogo, pedidos y reportes; validación de entradas; configuración y exposición de información.  
**Fallas asignadas:** #2, #3, #4, #9, #21, #22, #23 y #24.  
**Alcance:** únicamente las correcciones correspondientes a la Integrante 2.

---

## 1. Falla #2 — Inyección SQL en filtros del catálogo

### Qué es y por qué importa

La inyección SQL ocurre cuando una entrada del usuario se incorpora a una consulta como parte de su sintaxis. En un catálogo, un filtro o búsqueda manipulados pueden alterar las condiciones del `WHERE` y devolver productos que no corresponden a los criterios solicitados.

### Dónde estaba

`src/services/catalogo.service.ts`, consultas de búsqueda y filtros de tipo y variedad.

### Cómo se observa

Para comprobar la vulnerabilidad, se puede enviar a los filtros o búsqueda un valor como `' OR 1=1 --` y comparar los resultados con una búsqueda ordinaria.

La prueba manual debe registrar la URL, la respuesta y el comportamiento observado.

### Por qué ocurría

La consulta vulnerable interpolaba valores externos dentro del SQL en lugar de tratarlos como parámetros.

### Cómo se corrigió

Se parametrizaron los filtros de tipo, variedad y búsqueda mediante marcadores posicionales de PostgreSQL y un arreglo de parámetros.

De esta forma, las entradas se interpretan como datos y no como instrucciones SQL.

### Cómo se verifica

- `npm run test:seguridad`: aprobó «la búsqueda del catálogo NO se puede ampliar con SQL».
- `npm run test:seguridad`: aprobó «el filtro por origen NO se puede ampliar con SQL».
- `npm run check:security`: controles SQLi correspondientes aprobados.

---

## 2. Falla #3 — Inyección SQL en el filtro de pedidos por mesa

### Qué es y por qué importa

Un filtro por mesa construido mediante concatenación permite que el texto ingresado modifique la consulta y pueda ampliar indebidamente la lista de pedidos consultados.

### Dónde estaba

`src/services/pedidos.service.ts`, función de listado de pedidos por mesa.

### Cómo se observa

Para comprobar la vulnerabilidad, se puede consultar el listado con una mesa válida y luego con un valor manipulado, por ejemplo `' OR 1=1 --`.

Se deben comparar las respuestas y registrar los resultados de la prueba manual.

### Por qué ocurría

El valor de mesa se incorporaba directamente a la cadena SQL.

### Cómo se corrigió

Se reemplazó la interpolación por una consulta parametrizada, enviando la mesa como parámetro separado de la instrucción SQL.

### Cómo se verifica

- `npm run test:seguridad`: aprobó «el filtro por mesa NO se puede ampliar con SQL».

---

## 3. Falla #4 — Inyección SQL en reporte de ventas por origen

### Qué es y por qué importa

Una consulta de reportes que incorpora sin protección el origen solicitado puede permitir alteraciones de la consulta, incluidas tentativas de incorporar datos de otras tablas mediante `UNION`.

### Dónde estaba

`src/services/reportes.service.ts`, función `ventasPorVariedad`.

### Cómo se observa

Para comprobar la vulnerabilidad, se puede solicitar un reporte con un origen válido y comparar la respuesta con una entrada SQL manipulada.

### Por qué ocurría

El valor de origen se interpolaba dentro del SQL sin validar previamente los valores admitidos.

### Cómo se corrigió

Se aplicaron dos medidas complementarias:

1. Una lista blanca de variedades permitidas: `Brasil`, `Colombia` y `Etiopía`.
2. Una consulta parametrizada con `$1`.

Fragmento representativo:

```ts
const VARIEDADES_PERMITIDAS = [
  'Brasil',
  'Colombia',
  'Etiopía'
] as const;

// La consulta utiliza:
// HAVING pr.variedad = $1
// db.query(sql, [variedad])
```

La lista blanca impide utilizar valores fuera del dominio esperado y la parametrización evita que la entrada sea interpretada como código SQL.

### Cómo se verifica

- `npm run test:seguridad`: aprobó «el reporte por origen NO filtra otras tablas con UNION».
- Controles de SQLi del checklist aprobados.

---

## 4. Falla #9 — Validación insuficiente de entradas

### Qué es y por qué importa

Los datos recibidos por una API no deben asumirse correctos.

Cantidades negativas, tipos inesperados, identificadores inválidos, textos excesivamente largos o estados fuera del dominio pueden producir inconsistencias y errores de procesamiento.

### Dónde estaba

- `src/validacion.ts`: funciones reutilizables de validación y clase `ErrorValidacion`.
- `src/services/pedidos.service.ts`: creación y cambio de estado de pedidos.
- Servicios y rutas de productos y comentarios: validación de identificadores y longitud de reseñas.

### Cómo se observa

Se pueden realizar las siguientes pruebas manuales:

- Enviar un pedido con cantidad negativa.
- Enviar un pedido con cantidad no numérica.
- Intentar crear una reseña excesivamente larga.
- Solicitar un cambio de estado a un valor inexistente.

Se deben registrar los códigos HTTP y mensajes obtenidos.

### Por qué ocurría

Faltaban comprobaciones explícitas de tipo, rango, longitud y pertenencia a los valores permitidos antes de ejecutar operaciones de negocio.

### Cómo se corrigió

Se centralizaron validaciones reutilizables:

```ts
export function esEnteroEnRango(
  valor: unknown,
  minimo: number,
  maximo: number
): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= minimo &&
    valor <= maximo
  );
}

export class ErrorValidacion extends Error {
  readonly status = 400;

  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorValidacion';
  }
}
```

La creación de pedidos valida las cantidades y los datos recibidos.

Además, el cambio de estado se limita a los valores permitidos:

```ts
const ESTADOS_PERMITIDOS = [
  'abierto',
  'preparando',
  'listo',
  'entregado',
] as const;
```

Cualquier otro estado genera un `ErrorValidacion`.

### Cómo se verifica

- `npm run test:seguridad`: aprobó «no se aceptan cantidades negativas».
- `npm run test:seguridad`: aprobó «no se aceptan cantidades no numéricas».
- `npm run test:seguridad`: aprobó «no se aceptan reseñas sin límite de longitud».
- `npm run check:security`: aprobaron los controles `VAL-01`, `VAL-02`, `VAL-03` y `VAL-06`.

---

## 5. Falla #24 — Configuración insegura de la base de datos

### Qué es y por qué importa

Permitir conexiones sin contraseña, utilizar un superusuario para la aplicación o exponer credenciales en la configuración aumenta el impacto de una eventual vulnerabilidad SQL y facilita accesos indebidos.

### Dónde estaba

- `docker-compose.yml`
- Configuración de PostgreSQL.
- `src/config.ts`
- Archivos de inicialización de la base de datos.

### Cómo se observa

Se puede inspeccionar la configuración de Docker Compose, los roles de PostgreSQL y las variables de conexión.

Las evidencias no deben incluir contraseñas reales ni otros valores secretos.

### Por qué ocurría

La configuración original contemplaba autenticación `trust`, uso de un usuario con privilegios excesivos y manejo inseguro de información de conexión.

### Cómo se corrigió

Se aplicaron las siguientes medidas:

- Se eliminó la autenticación `trust`.
- Se configuró el usuario de aplicación `origen_app` con privilegios acotados.
- Se evitó exponer secretos desde `config.ts`.

Estas medidas reducen el impacto de una posible vulnerabilidad sobre la base de datos.

### Cómo se verifica

- `npm run test:seguridad`: aprobó «la aplicación NO se conecta con un superusuario de la base».
- `npm run check:security`: controles de configuración de base de datos correspondientes aprobados.

---

## 6. Fallas #21 y #22 — Diagnóstico expuesto y errores con información interna

### Qué es y por qué importa

Un endpoint de diagnóstico sin protección puede revelar credenciales, variables de entorno y detalles internos del servidor.

De forma similar, devolver stack traces en respuestas HTTP facilita conocer la estructura y el funcionamiento interno de la aplicación.

### Dónde estaba

- `src/routes/debug.routes.ts`: endpoint de diagnóstico.
- `src/app.ts`: manejador centralizado de errores y configuración de rutas.

### Cómo se observa

Se pueden inspeccionar las respuestas de errores de la API y verificar si contienen trazas o información sensible.

Para el diagnóstico, es necesario comprobar primero si la ruta está montada en la aplicación.

### Por qué ocurría

El diagnóstico devolvía `process.env` y campos de conexión a la base de datos sin autenticación.

El manejo de errores también permitía exponer detalles técnicos al cliente.

### Cómo se corrigió

Se retiraron del diagnóstico las variables de entorno y las credenciales.

El handler quedó limitado a usuarios autenticados con rol administrador:

```ts
router.get(
  '/',
  requiereSesion,
  requiereRol('admin'),
  (_req, res) => {
    res.json({
      mensaje: 'Diagnóstico del servidor',
      version: '1.0.0',
      estado: 'operativo',
      sistema: {
        node: process.version,
        uptime: process.uptime(),
      },
    });
  }
);
```

En el estado verificado, la ruta de diagnóstico no está montada en `src/app.ts`, por lo que no es accesible mediante HTTP.

El manejo de errores fue ajustado para evitar devolver stack traces en las respuestas de la API.

### Cómo se verifica

- `npm run test:seguridad`: aprobó «el endpoint de diagnóstico NO expone secretos».
- `npm run test:seguridad`: aprobó «la API NO devuelve stack traces al cliente».
- `npm run check:security`: aprobaron los controles de diagnóstico y exposición de secretos.

Las trazas que aparecen en la consola del servidor no equivalen a trazas enviadas en una respuesta HTTP.

---

## 7. Falla #23 — Ausencia de cabeceras de seguridad

### Qué es y por qué importa

Las cabeceras HTTP de seguridad ayudan a restringir comportamientos peligrosos del navegador.

Una política Content Security Policy (CSP) reduce las fuentes desde las que se pueden cargar scripts y otros recursos.

### Dónde estaba

`src/app.ts`, configuración de middleware HTTP.

### Cómo se observa

Para comprobar las cabeceras:

1. Abrir las herramientas de desarrollador del navegador.
2. Ingresar a la pestaña **Network**.
3. Seleccionar una respuesta del servidor.
4. Revisar las cabeceras HTTP de seguridad.

### Por qué ocurría

La aplicación no incorporaba una configuración suficiente de cabeceras de seguridad.

### Cómo se corrigió

Se incorporó `helmet` y se configuró una política `Content-Security-Policy` (CSP) para restringir las fuentes de contenido permitidas.

### Cómo se verifica

- `npm run test:seguridad`: aprobó «el sitio envía cabeceras de seguridad».

---

## 8. Resultados de verificación correspondientes a la Integrante 2

| Área | Evidencia automatizada aprobada |
|---|---|
| SQLi en catálogo | Búsqueda y filtro por origen no se amplían mediante SQL |
| SQLi en pedidos | Filtro por mesa no se amplía mediante SQL |
| SQLi en reportes | Reporte por origen no permite filtrar otras tablas mediante `UNION` |
| Base de datos | La aplicación no se conecta como superusuario |
| Validación | Se rechazan cantidades negativas y no numéricas; se limita longitud de reseñas |
| Exposición de información | Diagnóstico sin secretos y respuestas de API sin stack traces |
| Cabeceras HTTP | El sitio envía cabeceras de seguridad |
| Regresión funcional | `npm test`: **28 pruebas aprobadas** |
| Compilación | `npm run typecheck`: **sin errores** |

### Comandos utilizados para la verificación

```powershell
docker compose exec app npm run typecheck
docker compose exec app npm test
docker compose exec app npm run test:seguridad
docker compose exec app npm run check:security
```

Los resultados enumerados corresponden a controles individuales aprobados.

---

## 9. Reflexión final — ¿Qué haríamos diferente en un proyecto real?

Este trabajo evidencia que una aplicación puede funcionar correctamente en los casos habituales y, aun así, necesitar controles adicionales para resistir entradas maliciosas y configuraciones inseguras.

En un proyecto real, adoptaríamos consultas parametrizadas como regla obligatoria en toda la capa de acceso a datos. Esto permitiría evitar vulnerabilidades de inyección SQL desde el momento de desarrollar las funcionalidades, en lugar de corregirlas posteriormente.

También implementaríamos validaciones centralizadas de tipos, rangos, longitudes y valores permitidos. La validación debe realizarse en el servidor, independientemente de las restricciones que existan en el frontend.

En cuanto a la infraestructura, utilizaríamos cuentas de base de datos con el mínimo privilegio necesario y gestionaríamos los secretos fuera del código fuente. Además, configuraríamos un manejo uniforme de errores que no revele información interna al cliente.

Finalmente, incorporaríamos controles de seguridad automatizados a la integración continua y complementaríamos sus resultados con pruebas manuales reproducibles y evidencias verificables.

La principal conclusión es que la seguridad debe formar parte de todo el proceso de desarrollo, desde el diseño y la implementación hasta las pruebas y el despliegue.



