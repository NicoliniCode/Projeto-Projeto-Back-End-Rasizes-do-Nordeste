import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown[] = []) {
    super(message);
  }
}

export const asyncRoute = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {

  let status = 500;
  let code = 'ERRO_INTERNO';
  let message = 'Ocorreu um erro interno.';
  let details: unknown[] = [];

  if ( error instanceof ApiError ) {

    status = error.status; code = error.code; message = error.message; details = error.details;

  } else if ( error instanceof ZodError ) {

    status = 422; code = 'VALIDACAO_DADOS'; message = 'Dados inválidos.';
    details = error.issues.map( issue => ( { field: issue.path.join('.'), issue: issue.message }));

  } else if (error instanceof SyntaxError && 'body' in error) {

    status = 400; code = 'JSON_INVALIDO'; message = 'Corpo JSON malformado.';

  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {

    if (error.code === 'P2002') { status = 409; code = 'REGISTRO_DUPLICADO'; message = 'O registro já existe.'; }
    else if (error.code === 'P2025') { status = 404; code = 'NAO_ENCONTRADO'; message = 'Registro não encontrado.'; }
    else if (error.code === 'P2034') { status = 409; code = 'CONCORRENCIA'; message = 'Conflito concorrente; tente novamente.'; }
  }

  if (status >= 500) console.error('Erro interno:', error);
  res.status(status).json({ error: code, message, details, timestamp: new Date().toISOString(), path: req.originalUrl, requestId: randomUUID() });
};
