# Informe de Seguridad — Integrante 3: XSS, CSRF y Panel de Administración

**Proyecto:** Cafetería Origen (Programación IV — Redes y Seguridad)  
**Eje de trabajo:** XSS (Frontend), CSRF End-to-End y Panel Admin  
**Fallas abordadas:** `#5`, `#6`, `#7`, `#8`, `#10`, `#18`, `#19`, `#20`  
**Controles del checklist cubiertos:** `XSS-01`, `CSRF-01`, `CSRF-03`, `VAL-04`, `VAL-05`, `AUTH-14`, `AUTH-15`, `CMD-01` a `CMD-03`

---

## 1. Fallas #5, #6 y #7 — Cross-Site Scripting (XSS)

### Qué es y por qué importa
El **Cross-Site Scripting (XSS)** ocurre cuando la aplicación incluye datos no confiables en el HTML enviado al navegador sin una validación o escape adecuado. Esto permite a un atacante inyectar scripts maliciosos (generalmente JavaScript) que se ejecutan en el navegador de las víctimas, permitiendo el robo de cookies de sesión, la suplantación de identidad o la manipulación de la página.

### Dónde estaba
- **XSS Reflejado (#5):** `src/public/js/app.js` (buscador y mensajes de error del servidor).
- **XSS Almacenado (#6):** `src/public/js/app.js` (renderizado de reseñas de clientes).
- **XSS de DOM (#7):** `src/public/js/admin.js` (parámetro `vista` leído desde la URL).

### Cómo se observa (pruebas manuales en `localhost`)
1. **Reflejado:** En el buscador del catálogo, ingresar `<script>alert(1)</script>` y presionar Enter. En la versión vulnerable, el script se ejecutaba mostrando una alerta.
2. **Almacenado:** Publicar una reseña con el texto `<img src=x onerror=alert('hackeado')>`. Al recargar la página o al entrar otro usuario, la alerta saltaba automáticamente.
3. **DOM:** Acceder a `http://localhost:8090/admin.html?vista=<script>alert(1)</script>`. El script se ejecutaba al leer el parámetro de la URL e inyectarlo en el DOM.

### Por qué ocurría
Porque el código JavaScript del frontend utilizaba la propiedad `innerHTML` para construir el HTML de las tablas, tarjetas de productos y reseñas, interpolando directamente los datos que venían del servidor o del usuario.

### Cómo se corrigió
Se eliminó por completo el uso de `innerHTML` en ambos archivos. Se reemplazó por la creación segura de nodos del DOM utilizando `document.createElement()` y asignando el texto mediante `textContent`. Para listas y tablas, se utilizó `replaceChildren()` en lugar de reescribir el HTML interno.

Ejemplo de la corrección en reseñas:
```javascript
// Antes (Vulnerable):
contenedor.innerHTML = `<p>${comentario.texto}</p>`;

// Después (Seguro):
const p = document.createElement('p');
p.textContent = comentario.texto;
contenedor.replaceChildren(p);