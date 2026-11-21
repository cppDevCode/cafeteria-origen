/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var usuario = null;
  var productosCache = {};

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(valor) {
    return Number(valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  function api(url, opciones) {
    return fetch(API + url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function postJSON(url, cuerpo) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function putJSON(url, cuerpo) {
    return api(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function patchJSON(url, cuerpo) {
    return api(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function feedback(el, mensaje, ok) {
    el.className = 'form-feedback ' + (ok ? 'is-ok' : 'is-error');
    el.textContent = mensaje;
  }

  /* ------------------------------------------------------------------ login */
  function iniciarSesion(evento) {
    evento.preventDefault();
    var caja = $('#login-feedback');
    caja.className = 'form-feedback';

    postJSON('/auth/login', {
      username: $('#login-usuario').value,
      password: $('#login-password').value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No pudimos iniciar sesión: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      usuario = resp.data.usuario;
      mostrarPanel();
    });
  }

  function cerrarSesion() {
    postJSON('/auth/logout', {}).then(function () {
      usuario = null;
      $('#vista-login').hidden = false;
      $('#vista-panel').hidden = true;
      $('#admin-user').replaceChildren();
    });
  }

  function mostrarPanel() {
    $('#vista-login').hidden = true;
    $('#vista-panel').hidden = false;

    var adminUser = $('#admin-user');
    var txt1 = document.createTextNode('Sesión de ');
    var strongNombre = document.createElement('strong');
    strongNombre.textContent = usuario.nombre;
    var txt2 = document.createTextNode(' · rol: ');
    var strongRol = document.createElement('strong');
    strongRol.textContent = usuario.rol;
    adminUser.replaceChildren(txt1, strongNombre, txt2, strongRol);

    $('#panel-bienvenida').textContent = 'Hola, ' + usuario.nombre;
    cargarTodo();
  }

  function cargarTodo() {
    cargarResumen();
    cargarPedidos();
    cargarProductos();
    cargarReportes();
    cargarUsuarios();
  }

  /* ---------------------------------------------------------------- resumen */
  function crearKpi(label, value) {
    var div = document.createElement('div');
    div.className = 'kpi';

    var lbl = document.createElement('div');
    lbl.className = 'kpi-label';
    lbl.textContent = label;

    var val = document.createElement('div');
    val.className = 'kpi-value';
    val.textContent = value;

    div.append(lbl, val);
    return div;
  }

  function cargarResumen() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/mas-vendido').then(function (m) {
        api('/reportes/cantidad-vendida').then(function (c) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación total', value: money(f.data.facturado) },
            { label: 'Pedidos registrados', value: f.data.pedidos },
            {
              label: 'Producto más vendido',
              value: mas ? mas.nombre : '—',
            },
            {
              label: 'Unidades por tipo',
              value: Object.keys(c.data.cantidadVendida || {})
                .map(function (k) { return k + ': ' + c.data.cantidadVendida[k]; })
                .join(' · ') || '—',
            },
          ];

          var cont = $('#kpis');
          cont.replaceChildren.apply(cont, kpis.map(function (k) {
            return crearKpi(k.label, k.value);
          }));
        });
      });
    });
  }

  /* --------------------------------------------------------------- pedidos */
  function tablaPedidos(filas, conAcciones) {
    var table = document.createElement('table');

    if (!filas || filas.length === 0) {
      var wrap = document.createElement('div');
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No hay pedidos.';
      wrap.appendChild(p);
      return wrap;
    }

    var thead = document.createElement('thead');
    var trHead = document.createElement('tr');
    ['#', 'Mesa', 'Cliente', 'Estado'].forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    });
    var thTotal = document.createElement('th');
    thTotal.className = 'num';
    thTotal.textContent = 'Total';
    trHead.appendChild(thTotal);
    var thFecha = document.createElement('th');
    thFecha.textContent = 'Fecha';
    trHead.appendChild(thFecha);
    if (conAcciones) {
      var thAcc = document.createElement('th');
      thAcc.textContent = 'Acciones';
      trHead.appendChild(thAcc);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    filas.forEach(function (p) {
      var tr = document.createElement('tr');

      var tdId = document.createElement('td');
      tdId.textContent = p.id;
      tr.appendChild(tdId);

      var tdMesa = document.createElement('td');
      tdMesa.textContent = p.mesa;
      tr.appendChild(tdMesa);

      var tdCliente = document.createElement('td');
      tdCliente.textContent = p.cliente;
      tr.appendChild(tdCliente);

      var tdEstado = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'badge badge-' + p.estado;
      badge.textContent = p.estado;
      tdEstado.appendChild(badge);
      tr.appendChild(tdEstado);

      var tdTotal = document.createElement('td');
      tdTotal.className = 'num';
      tdTotal.textContent = money(p.total);
      tr.appendChild(tdTotal);

      var tdFecha = document.createElement('td');
      tdFecha.textContent = new Date(p.creado_en).toLocaleString('es-AR');
      tr.appendChild(tdFecha);

      if (conAcciones) {
        var tdAcc = document.createElement('td');
        var select = document.createElement('select');
        select.setAttribute('data-pedido', p.id);
        select.className = 'sel-estado';
        ['abierto', 'preparando', 'listo', 'entregado'].forEach(function (e) {
          var opt = document.createElement('option');
          opt.value = e;
          opt.textContent = e;
          if (e === p.estado) opt.selected = true;
          select.appendChild(opt);
        });
        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);
      }

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function cargarPedidos() {
    api('/pedidos').then(function (resp) {
      var pedidos = resp.data.pedidos || [];
      var t1 = $('#tabla-pedidos');
      t1.replaceChildren(tablaPedidos(pedidos, true));
      var t2 = $('#tabla-ultimos');
      t2.replaceChildren(tablaPedidos(pedidos.slice(0, 5), false));
    });
  }

  function cambiarEstado(evento) {
    var select = evento.target.closest('.sel-estado');
    if (!select) return;
    var id = select.getAttribute('data-pedido');
    patchJSON('/pedidos/' + id + '/estado', { estado: select.value }).then(function (resp) {
      if (!resp.ok) {
        alert('No se pudo cambiar el estado: ' + (resp.data.error || 'error'));
      }
      cargarPedidos();
    });
  }

  /* ------------------------------------------------------------- productos */
  function cargarProductos() {
    api('/productos').then(function (resp) {
      var productos = resp.data.productos || [];
      productosCache = {};

      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['#', 'Nombre', 'Tipo', 'Origen'].forEach(function (h) {
        var th = document.createElement('th');
        th.textContent = h;
        trHead.appendChild(th);
      });
      var thPrecio = document.createElement('th');
      thPrecio.className = 'num';
      thPrecio.textContent = 'Precio';
      trHead.appendChild(thPrecio);
      var thAcc = document.createElement('th');
      thAcc.textContent = 'Acciones';
      trHead.appendChild(thAcc);
      thead.appendChild(trHead);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      productos.forEach(function (p) {
        productosCache[p.id] = p;
        var tr = document.createElement('tr');

        var tdId = document.createElement('td');
        tdId.textContent = p.id;
        tr.appendChild(tdId);

        var tdNombre = document.createElement('td');
        tdNombre.textContent = p.nombre;
        tr.appendChild(tdNombre);

        var tdTipo = document.createElement('td');
        tdTipo.textContent = p.tipo;
        tr.appendChild(tdTipo);

        var tdVar = document.createElement('td');
        tdVar.textContent = p.variedad || '—';
        tr.appendChild(tdVar);

        var tdPrecio = document.createElement('td');
        tdPrecio.className = 'num';
        tdPrecio.textContent = money(p.precio);
        tr.appendChild(tdPrecio);

        var tdAcc = document.createElement('td');
        var btn = document.createElement('button');
        btn.className = 'link-danger';
        btn.setAttribute('data-borrar', p.id);
        btn.textContent = 'Borrar';
        tdAcc.appendChild(btn);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      $('#tabla-productos').replaceChildren(table);
    });
  }

  function guardarProducto(evento) {
    evento.preventDefault();
    var caja = $('#producto-feedback');
    var id = $('#producto-id').value;

    var cuerpo = {
      nombre: $('#p-nombre').value,
      tipo: $('#p-tipo').value,
      variedad: $('#p-variedad').value || null,
      tamano: $('#p-tamano').value || null,
      gramos: $('#p-gramos').value ? Number($('#p-gramos').value) : null,
      precio_base: Number($('#p-precio-base').value || 0),
      precio_por_gramo: Number($('#p-precio-gramo').value || 0),
      descripcion: $('#p-descripcion').value,
    };

    var peticion = id ? putJSON('/admin/productos/' + id, cuerpo) : postJSON('/admin/productos', cuerpo);

    peticion.then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo guardar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Producto guardado correctamente.', true);
      $('#form-producto').reset();
      $('#producto-id').value = '';
      cargarProductos();
    });
  }

  function borrarProducto(evento) {
    var btn = evento.target.closest('[data-borrar]');
    if (!btn) return;
    var id = btn.getAttribute('data-borrar');
    if (!confirm('¿Borrar el producto #' + id + '?')) return;

    api('/admin/productos/' + id, { method: 'DELETE' }).then(function (resp) {
      if (!resp.ok) alert('No se pudo borrar: ' + (resp.data.error || 'error'));
      cargarProductos();
    });
  }

  function limpiarFormularioProducto() {
    $('#form-producto').reset();
    $('#producto-id').value = '';
  }

  /* ---------------------------------------------------------------- upload */
  function subirArchivo(evento) {
    evento.preventDefault();
    var caja = $('#upload-feedback');
    var input = $('#archivo-subida');
    if (!input.files || !input.files[0]) {
      feedback(caja, 'Elegí un archivo primero.', false);
      return;
    }

    var archivo = input.files[0];
    var lector = new FileReader();

    lector.onload = function () {
      var base64 = String(lector.result).split(',')[1] || '';
      postJSON('/admin/subir-archivo', {
        nombre: archivo.name,
        contenidoBase64: base64,
      }).then(function (resp) {
        if (!resp.ok) {
          feedback(caja, 'No se pudo subir: ' + (resp.data.error || 'error desconocido'), false);
          return;
        }
        feedback(caja, 'Archivo subido a ' + resp.data.url, true);
      });
    };

    lector.readAsDataURL(archivo);
  }

  /* -------------------------------------------------------------- reportes */
  function cargarReportes() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/ticket-promedio').then(function (t) {
        api('/reportes/mas-vendido').then(function (m) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación', value: money(f.data.facturado) },
            { label: 'Pedidos', value: f.data.pedidos },
            { label: 'Ticket promedio', value: money(t.data.promedio) },
            { label: 'Más vendido', value: mas ? mas.nombre + ' (' + mas.unidades + ')' : '—' },
          ];
          var cont = $('#kpis-reportes');
          cont.replaceChildren.apply(cont, kpis.map(function (k) {
            return crearKpi(k.label, k.value);
          }));
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $('#reporte-feedback');
    var variedad = $('#reporte-variedad').value;

    api('/reportes/ventas-por-variedad?variedad=' + encodeURIComponent(variedad)).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'Error: ' + (resp.data.error || 'desconocido'), false);
        $('#tabla-ventas').replaceChildren();
        return;
      }
      var ventas = resp.data.ventas || [];

      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['Origen', 'Producto'].forEach(function (h) {
        var th = document.createElement('th');
        th.textContent = h;
        trHead.appendChild(th);
      });
      var thUnidades = document.createElement('th');
      thUnidades.className = 'num';
      thUnidades.textContent = 'Unidades';
      trHead.appendChild(thUnidades);
      var thTotal = document.createElement('th');
      thTotal.className = 'num';
      thTotal.textContent = 'Total';
      trHead.appendChild(thTotal);
      thead.appendChild(trHead);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      ventas.forEach(function (v) {
        var tr = document.createElement('tr');
        var tdVar = document.createElement('td');
        tdVar.textContent = v.variedad;
        tr.appendChild(tdVar);
        var tdNom = document.createElement('td');
        tdNom.textContent = v.nombre;
        tr.appendChild(tdNom);
        var tdUni = document.createElement('td');
        tdUni.className = 'num';
        tdUni.textContent = v.unidades;
        tr.appendChild(tdUni);
        var tdTot = document.createElement('td');
        tdTot.className = 'num';
        tdTot.textContent = money(v.total);
        tr.appendChild(tdTot);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      $('#tabla-ventas').replaceChildren(table);
      feedback(caja, 'Consulta realizada.', true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  function cargarUsuarios() {
    api('/admin/usuarios').then(function (resp) {
      var usuarios = resp.data.usuarios || [];

      var table = document.createElement('table');
      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['#', 'Usuario', 'Nombre', 'Rol', 'Acciones'].forEach(function (h) {
        var th = document.createElement('th');
        th.textContent = h;
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      usuarios.forEach(function (u) {
        var tr = document.createElement('tr');

        var tdId = document.createElement('td');
        tdId.textContent = u.id;
        tr.appendChild(tdId);

        var tdUser = document.createElement('td');
        tdUser.textContent = u.username;
        tr.appendChild(tdUser);

        var tdNom = document.createElement('td');
        tdNom.textContent = u.nombre;
        tr.appendChild(tdNom);

        var tdRol = document.createElement('td');
        var badge = document.createElement('span');
        badge.className = 'badge' + (u.rol === 'admin' ? ' badge-admin' : '');
        badge.textContent = u.rol;
        tdRol.appendChild(badge);
        tr.appendChild(tdRol);

        var tdAcc = document.createElement('td');
        var select = document.createElement('select');
        select.setAttribute('data-usuario', u.id);
        select.className = 'sel-rol';
        ['cliente', 'mozo', 'barista', 'admin'].forEach(function (r) {
          var opt = document.createElement('option');
          opt.value = r;
          opt.textContent = r;
          if (r === u.rol) opt.selected = true;
          select.appendChild(opt);
        });
        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      $('#tabla-usuarios').replaceChildren(table);
    });
  }

  function cambiarRol(evento) {
    var select = evento.target.closest('.sel-rol');
    if (!select) return;
    var id = select.getAttribute('data-usuario');

    putJSON('/admin/usuarios/' + id, { rol: select.value }).then(function (resp) {
      if (!resp.ok) alert('No se pudo actualizar: ' + (resp.data.error || 'error'));
      cargarUsuarios();
    });
  }

  function cambiarPassword(evento) {
    evento.preventDefault();
    var caja = $('#password-feedback');
    postJSON('/admin/cambiar-contrasena', { nueva: $('#nueva-password').value }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo cambiar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Contraseña actualizada.', true);
      $('#nueva-password').value = '';
    });
  }

  /* ----------------------------------------------------------- herramientas */
  function probarConexion(evento) {
    evento.preventDefault();
    var salida = $('#salida-conexion');
    salida.textContent = 'Probando…';

    postJSON('/admin/probar-conexion', { host: $('#conexion-host').value }).then(function (resp) {
      if (!resp.ok) {
        salida.textContent = 'Error: ' + (resp.data.error || 'desconocido');
        return;
      }
      salida.textContent =
        '$ ' + resp.data.comando + '\n\n' +
        (resp.data.salida || '') +
        (resp.data.error ? '\n[stderr]\n' + resp.data.error : '');
    });
  }

  function verDiagnostico() {
    var salida = $('#salida-diagnostico');
    salida.textContent = 'Cargando…';
    api('/_diagnostico').then(function (resp) {
      salida.textContent = JSON.stringify(resp.data, null, 2);
    });
  }

  /* ------------------------------------------------------------------ tabs */
  function activarTab(evento) {
    var tab = evento.target.closest('.tab');
    if (!tab) return;
    var vista = tab.getAttribute('data-vista');
    $$('.tab').forEach(function (t) { t.classList.remove('is-active'); });
    tab.classList.add('is-active');
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-panel') === vista);
    });
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    var params = new URLSearchParams(window.location.search);
    var objetivo = params.get('vista');
    if (objetivo) {
      $('#panel-bienvenida').textContent = 'Panel ' + objetivo;
    }

    $('#form-login').addEventListener('submit', iniciarSesion);
    $('#btn-logout').addEventListener('click', cerrarSesion);
    $('#btn-refrescar').addEventListener('click', cargarTodo);
    $('#tabs').addEventListener('click', activarTab);
    $('#tabla-pedidos').addEventListener('change', cambiarEstado);
    $('#tabla-productos').addEventListener('click', borrarProducto);
    $('#form-producto').addEventListener('submit', guardarProducto);
    $('#btn-limpiar-producto').addEventListener('click', limpiarFormularioProducto);
    $('#form-upload').addEventListener('submit', subirArchivo);
    $('#form-password').addEventListener('submit', cambiarPassword);
    $('#btn-reporte-variedad').addEventListener('click', consultarVentas);
    $('#tabla-usuarios').addEventListener('change', cambiarRol);
    $('#form-conexion').addEventListener('submit', probarConexion);
    $('#btn-diagnostico').addEventListener('click', verDiagnostico);

    api('/auth/yo').then(function (resp) {
      if (resp.ok) {
        usuario = resp.data.usuario;
        mostrarPanel();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
