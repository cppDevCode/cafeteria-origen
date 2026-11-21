import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import type { Pedido, PedidoConItems, PedidoItem, Producto } from '../tipos';
import { esEnteroEnRango, esTextoValido, esIdValido, ErrorValidacion } from '../validacion';

/** Un renglón del pedido, tal como llega en el cuerpo de la petición. */
export interface ItemPedido {
  productoId: number;
  cantidad: number;
}

/** Pedido nuevo, tal como llega en el cuerpo de la petición. */
export interface NuevoPedido {
  mesa: string;
  cliente: string;
  items: ItemPedido[];
}
const MAX_ITEMS = 30;
const MAX_CANTIDAD = 100;
const MAX_MESA = 30;
const MAX_CLIENTE = 100;

const ESTADOS_PERMITIDOS = [
  'abierto',
  'preparando',
  'listo',
  'entregado',
] as const;

/** Id tal como llega en la URL (texto) o ya convertido. */
type Id = number | string;

/**
 * Servicio de pedidos.
 *
 * -----------------------------------------------------------------------------
 * FALLA — Validación de entrada débil o insuficiente (OWASP A04:2021)
 * -----------------------------------------------------------------------------
 * No se valida nada de lo que llega en el cuerpo de la petición:
 *  - `cantidad` puede ser negativa (el total del pedido queda negativo),
 *    cero, un número decimal o un texto.
 *  - No hay un máximo de items ni de cantidad (DoS / facturas absurdas).
 *  - `mesa` y `cliente` no se validan ni se acotan en longitud.
 *  - Si el productoId no existe, la excepción sube y se filtra el stack.
 *
 * La corrección es validar TIPO (entero), RANGO (1..N), LONGITUD y FORMATO
 * de cada campo en el servidor, usando listas blancas.
 * -----------------------------------------------------------------------------
 */

/**
 * Crea un pedido a partir de una lista de items { productoId, cantidad }.
 * Total = suma de calcularPrecio(producto) x cantidad
 */
export async function crear({
  mesa,
  cliente,
  items,
}: NuevoPedido): Promise<PedidoConItems | null> {

  // Validar mesa y cliente
  if (!esTextoValido(mesa, 1, MAX_MESA)) {
    throw new ErrorValidacion('Mesa inválida.');
  }

  if (!esTextoValido(cliente, 1, MAX_CLIENTE)) {
    throw new ErrorValidacion('Cliente inválido.');
  }

  // Validar que items sea un arreglo no vacío y dentro del límite
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > MAX_ITEMS
  ) {
    throw new ErrorValidacion('La lista de productos es inválida.');
  }

  const filas: {
    productoId: number;
    cantidad: number;
    precioUnitario: number;
  }[] = [];

  // Validar cada producto antes de calcular el total
  for (const item of items) {

    // Validar ID del producto
    if (!item || !esIdValido(item.productoId)) {
      throw new ErrorValidacion('ID de producto inválido.');
    }

    // Validar cantidad: entero positivo dentro del rango permitido
    if (!esEnteroEnRango(item.cantidad, 1, MAX_CANTIDAD)) {
      throw new ErrorValidacion('Cantidad inválida.');
    }

    // Buscar el producto en la base de datos
    const producto = await buscarProducto(item.productoId);

    if (!producto) {
      throw new ErrorValidacion('Producto no encontrado.');
    }

    // Calcular precio unitario
    const precioUnitario = calcularPrecio(producto);

    filas.push({
      productoId: producto.id,
      cantidad: item.cantidad,
      precioUnitario,
    });
  }

  // Calcular el total del pedido
  const total = filas.reduce(
    (acc, f) => acc + f.precioUnitario * f.cantidad,
    0
  );

  // Guardar el pedido
  const { rows } = await db.query<Pedido>(
    `INSERT INTO pedidos (mesa, cliente, estado, total)
     VALUES ($1, $2, 'abierto', $3)
     RETURNING *`,
    [mesa, cliente, total]
  );

  const pedido = rows[0];

  // Guardar los items del pedido
  for (const fila of filas) {
    await db.query(
      `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [
        pedido.id,
        fila.productoId,
        fila.cantidad,
        fila.precioUnitario,
      ]
    );
  }

  // Devolver el pedido con sus items
  return obtenerConItems(pedido.id);
}


/** Busca un producto por id (helper interno). */
async function buscarProducto(productoId: number): Promise<Producto | undefined> {
  const { rows } = await db.query<Producto>(
    'SELECT * FROM productos WHERE id = $1',
    [productoId]
  );

  return rows[0];
}

/** Lista pedidos (con filtro opcional por mesa). */
export async function listar(mesa?: string): Promise<Pedido[]> {
  let sql = 'SELECT * FROM pedidos';
  const params: string[] = [];

  if (mesa) {
    sql += ' WHERE mesa = $1';
    params.push(mesa);
  }

  sql += ' ORDER BY id DESC';

  const { rows } = await db.query<Pedido>(sql, params);
  return rows;
}

/** Devuelve un pedido con sus items. */
export async function obtenerConItems(id: Id): Promise<PedidoConItems | null> {
  const { rows: pedidos } = await db.query<Pedido>(
    'SELECT * FROM pedidos WHERE id = $1',
    [id]
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const { rows: items } = await db.query<PedidoItem>(
    `SELECT pi.*, pr.nombre AS producto_nombre
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      WHERE pi.pedido_id = $1`,
    [id]
  );

  return { ...pedido, items };
}

/** Cambia el estado de un pedido. */
export async function cambiarEstado(
  id: Id,
  estado: string
): Promise<Pedido | null> {
  // Validar el estado contra una lista blanca
  if (
    !ESTADOS_PERMITIDOS.some(
      (permitido) => permitido === estado
    )
  ) {
    throw new ErrorValidacion('Estado de pedido inválido.');
  }

  const { rows } = await db.query<Pedido>(
    'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
    [estado, id]
  );

  return rows[0] || null;
}