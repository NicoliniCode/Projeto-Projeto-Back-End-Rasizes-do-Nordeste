import { CanalPedido, Perfil, Prisma, StatusPedido, type Pedido } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../infra/prisma';
import { ApiError } from '../api/errors';
import { type Identidade, verificarUnidade } from '../api/auth';

export const pedidoSchema = z.object({
  unidadeId: z.number().int().positive(),
  clienteId: z.number().int().positive().optional(),
  canalPedido: z.nativeEnum(CanalPedido),
  formaPagamento: z.literal('MOCK'),
  itens: z.array( z.object( { produtoId:z.number().int().positive(), quantidade:z.number().int().min(1).max(100) }).strict()).min(1).max(30)
    .refine(arr => new Set(arr.map(i => i.produtoId)).size === arr.length, 'Produtos repetidos no pedido.')
}).strict();

export const listaSchema = z.object({
  canalPedido: z.nativeEnum(CanalPedido).optional(),
  status: z.nativeEnum(StatusPedido).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const statusSchema = z.object( { status: z.enum( ['EM_PREPARO','PRONTO','ENTREGUE'] ) }).strict();

export const idSchema = z.coerce.number().int().positive();

const incluir = { itens: { include: { produto: { select: {nome:true} } } }, pagamentos: true } as const;

export function acessoPedido(pedido: Pick<Pedido, 'clienteId'|'unidadeId'>, usuario: Identidade): void {

  if (usuario.perfil === Perfil.ADMIN) return;

  if (usuario.perfil === Perfil.CLIENTE) {

    if (pedido.clienteId !== usuario.id) throw new ApiError(403, 'SEM_PERMISSAO', 'Pedido não pertence ao cliente.');
    return;
  }

  verificarUnidade(usuario, pedido.unidadeId);

}

export async function obterPedido( id: number, usuario: Identidade) {

  const pedido = await prisma.pedido.findUnique( { where: { id }, include: incluir });

  if (!pedido) throw new ApiError(404, 'PEDIDO_NAO_ENCONTRADO', 'Pedido inexistente.');

  acessoPedido(pedido, usuario);

  return pedido;

}

export async function criarPedido(entrada: z.infer<typeof pedidoSchema>, usuario: Identidade) {

  if ( !( [Perfil.CLIENTE, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN] as Perfil[]).includes(usuario.perfil)) {
    throw new ApiError(403, 'SEM_PERMISSAO', 'Perfil não pode registrar pedidos.');
  }

  if (usuario.perfil === Perfil.CLIENTE && entrada.canalPedido === CanalPedido.BALCAO) {
    throw new ApiError(403, 'CANAL_NAO_AUTORIZADO', 'Canal BALCAO é reservado à equipe.');
  }

  if (usuario.perfil !== Perfil.CLIENTE) verificarUnidade(usuario, entrada.unidadeId);

  const clienteId = usuario.perfil === Perfil.CLIENTE ? usuario.id : entrada.clienteId;

  if (!clienteId) throw new ApiError(422, 'CLIENTE_OBRIGATORIO', 'A equipe precisa informar clienteId.');
  if (usuario.perfil === Perfil.CLIENTE && entrada.clienteId && entrada.clienteId !== usuario.id) {
    throw new ApiError(403, 'SEM_PERMISSAO', 'Não é permitido fazer pedidos em nome de outra pessoa.');
  }

  const [ unidade, cliente ] = await Promise.all( [
    prisma.unidade.findUnique( { where:{ id: entrada.unidadeId } }),
    prisma.usuario.findUnique({where:{id: clienteId}})
  ]);

  if (!unidade?.ativo) throw new ApiError(404, 'UNIDADE_NAO_ENCONTRADA', 'Unidade inexistente ou inativa.');

  if (!cliente?.ativo || cliente.perfil !== Perfil.CLIENTE) throw new ApiError(404, 'CLIENTE_NAO_ENCONTRADO', 'Cliente inexistente ou inativo.');

  const ids = entrada.itens.map(i=>i.produtoId);

  const [cardapios, estoques] = await Promise.all([

    prisma.itemCardapio.findMany( 
      {
        where:{
          unidadeId:entrada.unidadeId, 
          produtoId:{ in:ids }
        }, include:{ produto:true }
      }
    ),
    prisma.estoque.findMany(
      {
        where:{
          unidadeId: entrada.unidadeId, 
          produtoId:{ in:ids }
        }
      }
    )
  ]);

  const itens = entrada.itens.map( item => {

    const linha = cardapios.find( c => c.produtoId === item.produtoId );

    if ( !linha?.disponivel || !linha.produto.ativo ) throw new ApiError(404,'PRODUTO_NAO_ENCONTRADO',`Produto ${item.produtoId} fora do cardápio ativo.`);

    const saldo = estoques.find( e => e.produtoId === item.produtoId)?.quantidade ?? 0;

    if ( saldo < item.quantidade) throw new ApiError( 409,'ESTOQUE_INSUFICIENTE',`Estoque insuficiente para produto ${item.produtoId}.`);

    return { 
      produtoId: item.produtoId, 
      quantidade: item.quantidade, 
      precoUnitario: linha.preco, 
      subtotal: linha.preco.mul( item.quantidade )
    };
  });

  const total = itens.reduce((ac,item)=>ac.add(item.subtotal), new Prisma.Decimal(0));

  return prisma.$transaction(async tx => {

    const pedido = await tx.pedido.create({
      data: {
        clienteId, 
        unidadeId:entrada.unidadeId, 
        canalPedido:entrada.canalPedido, 
        total, itens:{ create:itens }
      },
      include: incluir
    });

    await tx.auditoria.create(
      { 
        data:{
          atorId:usuario.id, 
          acao:'PEDIDO_CRIADO', 
          entidade:'PEDIDO', 
          entidadeId:pedido.id, 
          unidadeId:pedido.unidadeId, 
          dados:{
            canalPedido:pedido.canalPedido, 
            status:pedido.status
          }
        }
      });

    return pedido;

  });
  
}

export async function listarPedidos( parametros: z.infer < typeof listaSchema >, usuario: Identidade ) {

  const where: Prisma.PedidoWhereInput = {
    ...(parametros.canalPedido ? { canalPedido:parametros.canalPedido }:{} ),
    ...(parametros.status ? { status:parametros.status }:{} )
  };

  if (usuario.perfil === Perfil.CLIENTE) where.clienteId = usuario.id;

  else if (usuario.perfil !== Perfil.ADMIN) {

    if (!usuario.unidadeId) throw new ApiError( 403, 'SEM_UNIDADE', 'Funcionário não vinculado a uma unidade.');

    where.unidadeId = usuario.unidadeId;

  }

  const [total, dados] = await Promise.all([
    prisma.pedido.count({where}),
    prisma.pedido.findMany(
      { where, 
        include:incluir, 
        orderBy:{
          criadoEm:'desc'
        },
        skip:( parametros.page - 1 ) * parametros.limit, take:parametros.limit 
      }
    )
    
  ]);

  return {dados,paginacao:{page:parametros.page,limit:parametros.limit,total}};
}

const transicoes: Record<string,string> = {PAGO:'EM_PREPARO',EM_PREPARO:'PRONTO',PRONTO:'ENTREGUE'};

export async function atualizarStatus(id:number, novo: 'EM_PREPARO'|'PRONTO'|'ENTREGUE', usuario:Identidade) {

  if ( !( [Perfil.COZINHA, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN] as Perfil[] ).includes(usuario.perfil) ) throw new ApiError(403,'SEM_PERMISSAO','Perfil não pode alterar status.');

  return prisma.$transaction(async tx => {

    const pedido = await tx.pedido.findUnique( { where:{id} } );

    if (!pedido) throw new ApiError(404,'PEDIDO_NAO_ENCONTRADO','Pedido inexistente.');

    acessoPedido( pedido, usuario );

    if ( transicoes[pedido.status]!==novo) throw new ApiError(409,'TRANSICAO_INVALIDA','Transição de status não permitida.');

    if ( usuario.perfil === Perfil.COZINHA && novo === 'ENTREGUE' ) throw new ApiError(403, 'SEM_PERMISSAO', 'Cozinha não pode concluir entrega.');

    if ( usuario.perfil === Perfil.ATENDENTE && novo !== 'ENTREGUE') throw new ApiError(403, 'SEM_PERMISSAO', 'Atendente apenas conclui entrega.');

    const atualizado = await tx.pedido.updateMany( 
      { 
        where:{ 
          id, 
          status:pedido.status
        }, 
        data:{
          status:novo
        } 
      } 
    );

    if ( atualizado.count !== 1 ) throw new ApiError( 409, 'CONCORRENCIA', 'Status atualizado por outra operação.');

    await tx.auditoria.create( { 
      data:{ 
        atorId:usuario.id, 
        acao:'PEDIDO_STATUS_ALTERADO', 
        entidade:'PEDIDO', 
        entidadeId:id,
        unidadeId:pedido.unidadeId,
        dados:{ 
          de:pedido.status, 
          para:novo}
        } 
      }
    );
    
    return tx.pedido.findUniqueOrThrow({where:{id},include:incluir});

  });

}

export async function cancelar(id:number,usuario:Identidade) {

  return prisma.$transaction( async tx => {

    const pedido = await tx.pedido.findUnique( { where:{id} } )  ;

    if (!pedido) throw new ApiError(404,'PEDIDO_NAO_ENCONTRADO','Pedido inexistente.');
    acessoPedido(pedido,usuario);

    if ( !( [ StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.PAGAMENTO_RECUSADO ] as StatusPedido[] ).includes( pedido.status ) ) throw new ApiError( 409,'CANCELAMENTO_INVALIDO', 'MVP permite cancelar somente pedido não pago.');

    const atual = await tx.pedido.updateMany( 
      { 
        where:{ id, status:pedido.status }, 
        data:{ status:'CANCELADO' } 
      } 
    );

    if ( atual.count !== 1 ) throw new ApiError( 409, 'CONCORRENCIA', 'Pedido alterado durante cancelamento.');

    await tx.auditoria.create( 
      { 
        data:{ 
          atorId:usuario.id, 
          acao:'PEDIDO_CANCELADO', 
          entidade:'PEDIDO', 
          entidadeId:id,
          unidadeId:pedido.unidadeId 
        } 
      }
    );

    return tx.pedido.findUniqueOrThrow( {where:{id}, include:incluir} );
    
  });

}
