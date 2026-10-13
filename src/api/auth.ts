import type { Request, RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Perfil, type Usuario } from '@prisma/client';
import { prisma } from '../infra/prisma';
import { ApiError, asyncRoute } from './errors';
import { z } from 'zod';

export type Identidade = Pick<Usuario, 'id' | 'nome' | 'email' | 'perfil' | 'unidadeId'>;
export type RequestAutenticado = Request & { usuario: Identidade };

export function identidade(req: Request): Identidade {
  
  const usuario = (req as RequestAutenticado).usuario;
  if (!usuario) throw new ApiError(401, 'NAO_AUTENTICADO', 'Token ausente ou inválido.');
  return usuario;
}
export const exigirAutenticacao: RequestHandler = asyncRoute(async (req, _res, next) => {

  const cabecalho = req.headers.authorization;

  const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : '';

  if (!token) throw new ApiError(401, 'NAO_AUTENTICADO', 'Informe um token Bearer.');

  let payload: string | JwtPayload;

  try { payload = jwt.verify( token, process.env.JWT_SECRET!); }

  catch { throw new ApiError(401, 'NAO_AUTENTICADO', 'Token inválido ou expirado.'); }

  if (typeof payload === 'string' || !payload.sub || !/^\d+$/.test(payload.sub)) {

    throw new ApiError(401, 'NAO_AUTENTICADO', 'Token inválido.');

  }

  const usuario = await prisma.usuario.findUnique(
    { 
      where: 
      { id: Number(payload.sub) }, 
      select: { 
        id:true, 
        nome:true, 
        email:true, 
        perfil:true, 
        unidadeId:true, 
        ativo:true } 
      }
    );

  if (!usuario?.ativo) throw new ApiError(401, 'NAO_AUTENTICADO', 'Conta inválida ou inativa.');

  ( req as RequestAutenticado).usuario = { 
                                          id:usuario.id, 
                                          nome:usuario.nome, 
                                          email:usuario.email, 
                                          perfil:usuario.perfil, 
                                          unidadeId:usuario.unidadeId 
                                        };
  next();

});

export function permitir(...perfis: Perfil[]): RequestHandler {
  return (req, _res, next) => {
    if (!perfis.includes(identidade(req).perfil)) return next(new ApiError(403, 'SEM_PERMISSAO', 'Perfil sem permissão para esta operação.'));
    next();
  };
}

export function verificarUnidade(usuario: Identidade, unidadeId: number): void {

  if (usuario.perfil !== Perfil.ADMIN && usuario.perfil !== Perfil.CLIENTE && usuario.unidadeId !== unidadeId) {
    throw new ApiError(403, 'SEM_PERMISSAO', 'Acesso negado para outra unidade.');
  }

}

const loginSchema = z.object({ email: z.string().email(), senha: z.string().min(1) }).strict();

export const login = asyncRoute(async (req, res) => {

  const { email, senha } = loginSchema.parse(req.body);

  const usuario = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
  
  if ( !usuario || !usuario.ativo || !( await bcrypt.compare(senha, usuario.senhaHash ) ) ) {

    throw new ApiError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
  } 

  const token = jwt.sign(
    { perfil: usuario.perfil }, 
    process.env.JWT_SECRET!,
    { 
      subject: String(usuario.id), 
      expiresIn: '2h' 
    }
  );
  res.json({ accessToken: token, tokenType: 'Bearer', expiresIn: 7200,
    user: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, unidadeId: usuario.unidadeId } });
});
