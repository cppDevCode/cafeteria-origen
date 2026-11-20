/**
 * Validaciones de entrada reutilizables.
 * Los datos externos se reciben como unknown para comprobar
 * sus tipos durante la ejecución.
 */

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

export function esTextoValido(
    valor: unknown,
    longitudMinima: number,
    longitudMaxima: number
    ): valor is string {
    return (
        typeof valor === 'string' &&
        valor.trim().length >= longitudMinima &&
        valor.length <= longitudMaxima
    );
}

export function esIdValido(valor: unknown): boolean {
    if (typeof valor === 'number') {
        return Number.isSafeInteger(valor) && valor > 0;
    }

    if (typeof valor === 'string') {
        return /^[1-9]\d*$/.test(valor) &&
        Number.isSafeInteger(Number(valor));
    }

    return false;
}

export class ErrorValidacion extends Error {
    constructor(mensaje: string) {
        super(mensaje);
        this.name = 'ErrorValidacion';
    }
}