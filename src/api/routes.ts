import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../infra/prisma';
import { ApiError, asyncRoute } from './errors';
import { exigirAutenticacao, identidade, login, permitir, verificarUnidade } from './auth';
import { atualizarStatus, cancelar, criarPedido, idSchema, listaSchema, obterPedido, pedidoSchema, statusSchema, listarPedidos } from '../services/pedidos';
import { pagarMock, pagamentoSchema } from '../services/pagamentos';

export const api = Router();

api.post('/auth/login',login);
api.get( '/health', (_req, res) => res.json(
  {
    status:'ok',
    servico:'raizes-do-nordeste'
  }
));

api.get('/unidades', asyncRoute( async (_req, res) => { 

  const unidades=await prisma.unidade.findMany(
    {
      where:{
        ativo:true
      },
      select:{
        id:true,
        nome:true,
        cidade:true
      },
      orderBy:{ id:'asc'} 
    }
  );

  res.json(unidades);

}));

api.get('/unidades/:id/cardapio', asyncRoute( async ( req, res ) => {

  const id = idSchema.parse( req.params.id );

  const unidade = await prisma.unidade.findFirst({ where:{ id,ativo:true } });

  if (!unidade) throw new ApiError( 404,'UNIDADE_NAO_ENCONTRADA', 'Unidade inexistente.');

  const itens=await prisma.itemCardapio.findMany(
    {
      where:{
        unidadeId: id,
        disponivel: true,
        produto:{ ativo:true }
      },
      include:{
        produto:{
          select:{
            nome:true,
            descricao:true
          }
        }
      },
      orderBy:{ produtoId:'asc' }
    }
  );

  res.json(
    {
      unidade:{
        id:unidade.id,
        nome:unidade.nome
      },
      itens:itens.map(
        i => ( 
          {
            produtoId: i.produtoId,
            nome :i.produto.nome,
            descricao: i.produto.descricao,
            preco:i.preco
          }
        )
      )
    }
  );

}));

api.get( '/unidades/:id/estoque', exigirAutenticacao,permitir( Perfil.GERENTE, Perfil.ADMIN), asyncRoute(async( req, res) => { 

  const id = idSchema.parse( req.params.id ); verificarUnidade( identidade(req), id );

  const unidade = await prisma.unidade.findUnique( { where:{ id } } );

  if (!unidade) throw new ApiError( 404, 'UNIDADE_NAO_ENCONTRADA', 'Unidade inexistente.');

  const estoques = await prisma.estoque.findMany(
    {
      where:{ unidadeId:id },
      include:{ 
        produto:{ 
          select:{ nome:true }
        }
      },
      orderBy:{ produtoId:'asc'} 
    }
  );

  res.json(
    {
      unidadeId:id,
      estoques:estoques.map( 
        e => (
          {
            produtoId:e.produtoId,
            produto:e.produto.nome,
            quantidade:e.quantidade
          }
        )
      )
    }
  );

}));

api.post('/pedidos',exigirAutenticacao,asyncRoute(async( req, res ) => {

  const dados=pedidoSchema.parse(req.body);
  const pedido=await criarPedido(dados,identidade(req));

  res.status(201).json(pedido);

}));

api.get('/pedidos',exigirAutenticacao,asyncRoute(async( req, res ) => {

  const filtros = listaSchema.parse(req.query);

  res.json( 
    await listarPedidos( filtros,identidade(req) )
  );

}));

api.get('/pedidos/:id',exigirAutenticacao,asyncRoute(async( req, res ) => {

  res.json( 
    await obterPedido(
      idSchema.parse(req.params.id), 
      identidade(req)
    )
  );

}));

api.post('/pedidos/:id/pagamentos/mock', exigirAutenticacao,asyncRoute( async( req, res ) => {

  const dados = pagamentoSchema.parse(req.body);

  res.status(200).json( 
    await pagarMock( 
      idSchema.parse(req.params.id), 
      dados, identidade(req)
    )
  );


}));

api.patch('/pedidos/:id/status', exigirAutenticacao,asyncRoute(async( req, res ) =>{

  const dados=statusSchema.parse(req.body);

  res.json(
    await atualizarStatus(
      idSchema.parse(req.params.id),
      dados.status,
      identidade(req)
    )
  );

}));

api.post('/pedidos/:id/cancelamento',exigirAutenticacao,asyncRoute(async(req,res)=>{
  res.json(
    await cancelar(
      idSchema.parse( req.params.id),
      identidade(req)
    )
  );

}));

api.get( '/auditoria', 
  exigirAutenticacao, 
  permitir (Perfil.GERENTE, Perfil.ADMIN),
  asyncRoute( 

    async( req, res) => {

      const usuario=identidade(req);
      const query = z.object(
        {
          unidadeId:z.coerce.number().int().positive().optional(),
          limit:z.coerce.number().int().min(1).max(100).default(50)
        }
      ).parse( req.query );

  if ( usuario.perfil === Perfil.GERENTE && !usuario.unidadeId ) throw new ApiError(403, 'SEM_UNIDADE', 'Gerente sem unidade vinculada.');

  const unidadeId = usuario.perfil === Perfil.GERENTE ? usuario.unidadeId! : query.unidadeId;

  if ( usuario.perfil === Perfil.GERENTE && query.unidadeId && query.unidadeId !== usuario.unidadeId ) throw new ApiError(403,'SEM_PERMISSAO','Auditoria de outra unidade não permitida.');

  const eventos = await prisma.auditoria.findMany(
    {
      where:unidadeId?{ unidadeId }:{},
      orderBy:{ criadoEm:'desc' },
      take:query.limit,
      select:{
        id:true,
        atorId:true,
        acao:true,
        entidade:true,
        entidadeId:true,
        unidadeId:true,
        dados:true,
        criadoEm:true
      }
    }
  );
  res.json(eventos);
}));
