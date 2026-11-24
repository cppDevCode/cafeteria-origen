/* =============================================================================
   Cafetería Origen — lógica del sitio público
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var CARRITO_KEY = 'origen.carrito';
  var csrfToken = null;

  var estado = {
    tipo: '',
    variedad: '',
    q: '',
    carrito: cargarCarrito(),
  };

  function $(sel) { return document.querySelector(sel); }

  function money(valor) {
    var n = Number(valor || 0);
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  async function api(url, opciones) {
    opciones = opciones || {};
    var metodo = (opciones.method || 'GET').toUpperCase();

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) {
      if (!csrfToken) {
        var resCsrf = await fetch('/api/csrf-token');
        var dataCsrf = await resCsrf.json();
        csrfToken = dataCsrf.csrfToken;
      }
      opciones.headers = opciones.headers || {};
      opciones.headers['X-CSRF-Token'] = csrfToken;
      opciones.headers['Content-Type'] = opciones.headers['Content-Type'] || 'application/json';
    }

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

  function guardarCarrito() {
    try {
      localStorage.setItem(CARRITO_KEY, JSON.stringify(estado.carrito));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function cargarCarrito() {
    try {
      return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function urlCatalogo() {
    var params = new URLSearchParams();
    if (estado.tipo) params.set('tipo', estado.tipo);
    if (estado.variedad) params.set('variedad', estado.variedad);
    if (estado.q) params.set('q', estado.q);
    var s = params.toString();
    return '/productos' + (s ? '?' + s : '');
  }

  function cargarProductos() {
    return api(urlCatalogo()).then(function (resp) {
      if (!resp.ok) {
        renderErrorProductos(resp.data && resp.data.error);
        return;
      }
      renderProductos(resp.data.productos);
      renderResultado(resp.data.filtros, resp.data.total);
    });
  }

  function renderProductos(productos) {
    var grid = $('#productos-grid');

    if (!productos || productos.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No encontramos productos con esos filtros.';
      grid.replaceChildren(empty);
      return;
    }

    var cards = productos.map(function (p) {
      window.__productos[p.id] = p;

      var article = document.createElement('article');
      article.className = 'product-card';

      var top = document.createElement('div');
      top.className = 'product-top';

      var h3 = document.createElement('h3');
      h3.className = 'product-name';
      h3.textContent = p.nombre;

      var price = document.createElement('span');
      price.className = 'product-price';
      price.textContent = money(p.precio);

      top.append(h3, price);

      var tagsCont = document.createElement('div');
      tagsCont.className = 'product-tags';

      var tagTipo = document.createElement('span');
      tagTipo.className = 'tag';
      tagTipo.textContent = p.tipo;
      tagsCont.appendChild(tagTipo);

      if (p.variedad) {
        var tagVar = document.createElement('span');
        tagVar.className = 'tag tag-origen';
        tagVar.textContent = p.variedad;
        tagsCont.appendChild(tagVar);
      }
      if (p.tamano) {
        var tagTam = document.createElement('span');
        tagTam.className = 'tag';
        tagTam.textContent = p.tamano;
        tagsCont.appendChild(tagTam);
      }

      var desc = document.createElement('p');
      desc.className = 'product-desc';
      desc.textContent = p.descripcion;

      var btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-agregar';
      btn.setAttribute('data-id', p.id);
      btn.textContent = 'Agregar';

      article.append(top, tagsCont, desc, btn);
      return article;
    });

    grid.replaceChildren.apply(grid, cards);
  }

  function renderResultado(filtros, total) {
    var el = $('#resultado-busqueda');

    if (filtros && filtros.q) {
      var strong = document.createElement('strong');
      strong.textContent = filtros.q;
      el.replaceChildren(
        document.createTextNode('Resultados para '),
        strong,
        document.createTextNode(' — ' + total + ' producto(s)')
      );
    } else {
      el.textContent = total + ' producto(s) en el menú';
    }
  }

  function renderErrorProductos(mensaje) {
    var p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No se pudo cargar el menú: ' + (mensaje || 'error desconocido');
    $('#productos-grid').replaceChildren(p);
  }

  function agregarAlCarrito(productoId) {
    var existente = null;
    for (var i = 0; i < estado.carrito.length; i++) {
      if (String(estado.carrito[i].id) === String(productoId)) existente = estado.carrito[i];
    }
    if (existente) {
      existente.cantidad += 1;
    } else {
      estado.carrito.push({
        id: productoId,
        nombre: window.__productos[productoId] ? window.__productos[productoId].nombre : 'Producto',
        precio: window.__productos[productoId] ? window.__productos[productoId].precio : 0,
        cantidad: 1,
      });
    }
    guardarCarrito();
    renderCarrito();
  }

  function cambiarCantidad(indice, delta) {
    var item = estado.carrito[indice];
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function quitarDelCarrito(indice) {
    estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function renderCarrito() {
    var cont = $('#carrito');
    var lista = $('#resumen-carrito');
    var total = 0;

    if (estado.carrito.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'El carrito está vacío.';
      cont.replaceChildren(empty);
      lista.replaceChildren();
      $('#resumen-total').textContent = money(0);
      return;
    }

    var items = estado.carrito.map(function (item, i) {
      var subtotal = item.precio * item.cantidad;
      total += subtotal;

      var div = document.createElement('div');
      div.className = 'cart-item';

      var info = document.createElement('div');
      var nombre = document.createElement('div');
      nombre.className = 'cart-item-name';
      nombre.textContent = item.nombre;
      var meta = document.createElement('div');
      meta.className = 'cart-item-meta';
      meta.textContent = money(item.precio) + ' c/u';
      info.append(nombre, meta);

      var qty = document.createElement('div');
      qty.className = 'qty-control';

      var btnMenos = document.createElement('button');
      btnMenos.type = 'button';
      btnMenos.setAttribute('data-acc', 'menos');
      btnMenos.setAttribute('data-i', i);
      btnMenos.textContent = '−';

      var spanCant = document.createElement('span');
      spanCant.textContent = item.cantidad;

      var btnMas = document.createElement('button');
      btnMas.type = 'button';
      btnMas.setAttribute('data-acc', 'mas');
      btnMas.setAttribute('data-i', i);
      btnMas.textContent = '+';

      qty.append(btnMenos, spanCant, btnMas);

      var right = document.createElement('div');
      var priceDiv = document.createElement('div');
      priceDiv.className = 'cart-item-price';
      priceDiv.textContent = money(subtotal);
      var btnQuitar = document.createElement('button');
      btnQuitar.type = 'button';
      btnQuitar.className = 'link-danger';
      btnQuitar.setAttribute('data-acc', 'quitar');
      btnQuitar.setAttribute('data-i', i);
      btnQuitar.textContent = 'Quitar';
      right.append(priceDiv, btnQuitar);

      div.append(info, qty, right);
      return div;
    });

    cont.replaceChildren.apply(cont, items);

    var lis = estado.carrito.map(function (item) {
      var li = document.createElement('li');
      var span1 = document.createElement('span');
      span1.textContent = item.nombre + ' × ' + item.cantidad;
      var span2 = document.createElement('span');
      span2.textContent = money(item.precio * item.cantidad);
      li.append(span1, span2);
      return li;
    });

    lista.replaceChildren.apply(lista, lis);

    $('#resumen-total').textContent = money(total);
  }

  function enviarPedido(evento) {
    evento.preventDefault();
    var feedback = $('#pedido-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Enviando…';

    postJSON('/pedidos', {
      mesa: $('#pedido-mesa').value,
      cliente: $('#pedido-cliente').value,
      items: estado.carrito.map(function (item) {
        return { productoId: item.id, cantidad: item.cantidad };
      }),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No pudimos enviar el pedido: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Pedido #' + resp.data.id + ' recibido! Total ' + money(resp.data.total) +
        '. Te atendemos en la mesa ' + resp.data.mesa + '.';
      estado.carrito = [];
      guardarCarrito();
      renderCarrito();
      $('#form-pedido').reset();
    }).catch(function () {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'Error de conexión con el servidor.';
    });
  }

  function cargarReseñas() {
    return api('/comentarios').then(function (resp) {
      var cont = $('#lista-resenas');
      if (!resp.ok || !resp.data.comentarios || resp.data.comentarios.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'Todavía no hay reseñas. ¡Sé el primero!';
        cont.replaceChildren(empty);
        return;
      }

      var articles = resp.data.comentarios.map(function (c) {
        var article = document.createElement('article');
        article.className = 'review';

        var head = document.createElement('div');
        head.className = 'review-head';

        var author = document.createElement('span');
        author.className = 'review-author';
        author.textContent = c.autor;

        var stars = document.createElement('span');
        stars.className = 'review-stars';
        var estrellas = '';
        var i;
        var calificacion = Number(c.calificacion || 0);
        if (!isFinite(calificacion) || calificacion < 0) calificacion = 0;
        for (i = 0; i < calificacion; i++) estrellas += '★';
        stars.textContent = estrellas;

        head.append(author, stars);

        var text = document.createElement('p');
        text.className = 'review-text';
        text.textContent = c.texto;

        article.append(head, text);
        return article;
      });

      cont.replaceChildren.apply(cont, articles);
    });
  }

  function enviarReseña(evento) {
    evento.preventDefault();
    var feedback = $('#resena-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Publicando…';

    postJSON('/comentarios', {
      autor: $('#resena-autor').value,
      texto: $('#resena-texto').value,
      calificacion: Number($('#resena-calificacion').value),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No se pudo publicar: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Gracias por tu reseña!';
      $('#form-resena').reset();
      cargarReseñas();
    });
  }

  function init() {
    window.__productos = {};

    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        estado.tipo = chip.getAttribute('data-tipo');
        cargarProductos();
      });
    });

    $('#filtro-variedad').addEventListener('change', function (e) {
      estado.variedad = e.target.value;
      cargarProductos();
    });

    var temporizador = null;
    $('#filtro-busqueda').addEventListener('input', function (e) {
      estado.q = e.target.value;
      clearTimeout(temporizador);
      temporizador = setTimeout(cargarProductos, 250);
    });

    $('#productos-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-agregar');
      if (!btn) return;
      agregarAlCarrito(btn.getAttribute('data-id'));
    });

    $('#carrito').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var i = Number(btn.getAttribute('data-i'));
      var accion = btn.getAttribute('data-acc');
      if (accion === 'mas') cambiarCantidad(i, 1);
      else if (accion === 'menos') cambiarCantidad(i, -1);
      else if (accion === 'quitar') quitarDelCarrito(i);
    });

    $('#form-pedido').addEventListener('submit', enviarPedido);
    $('#form-resena').addEventListener('submit', enviarReseña);

    api(urlCatalogo()).then(function (resp) {
      if (resp.ok) {
        (resp.data.productos || []).forEach(function (p) { window.__productos[p.id] = p; });
        renderProductos(resp.data.productos);
        renderResultado(resp.data.filtros, resp.data.total);
      } else {
        renderErrorProductos(resp.data.error);
      }
    });
    cargarReseñas();
    renderCarrito();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();