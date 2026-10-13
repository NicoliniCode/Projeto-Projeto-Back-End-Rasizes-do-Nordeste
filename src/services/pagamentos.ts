import { Perfil, Prisma, StatusPedido } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../infra/prisma';
import { ApiError } from '../api/errors';
import { acessoPedido } from './pedidos';
import type { Identidade } from '../api/auth';

export const pagamentoSchema = z.object({
  chaveIdempotencia: z.string().min(8).max(120),
  resultadoMock: z.enum(['APROVADO', 'RECUSADO', 'ERRO'])
}).strict();

type Entrada = z.infer <typeof pagamentoSchema>;

export async function pagarMock(pedidoId: number, entrada: Entrada, usuario: Identidade) {

  if (process.env.MOCK_PAYMENTS_ENABLED !== 'true' || process.env.NODE_ENV === 'production') {

    throw new ApiError(403,'PAGAMENTO_MOCK_DESABILITADO', 'Simulação de pagamento desabilitada neste ambiente.');

  }

  if ( !( [ Perfil.CLIENTE, Perfil.ATENDENTE, Perfil.GERENTE, Perfil.ADMIN ] as Perfil[] ).includes(usuario.perfil) ) {

    throw new ApiError(403,'SEM_PERMISSAO', 'Perfil não pode solicitar pagamento.');

  }

  return prisma.$transaction( async tx => {


    const repetido = await tx.pagamento.findUnique( 
      {
        where:{
          pedidoId_chaveIdempotencia:{
            pedidoId,
            chaveIdempotencia:entrada.chaveIdempotencia
          }
        }
      }
    );

    const pedido = await tx.pedido.findUnique({ where:{id:pedidoId}, include:{itens:true} });

    if (!pedido) throw new ApiError(404,'PEDIDO_NAO_ENCONTRADO','Pedido inexistente.');

    acessoPedido(pedido, usuario);

    if (repetido) {

      if (repetido.resultadoSimulado!==entrada.resultadoMock) throw new ApiError(409,'CHAVE_IDEMPOTENCIA_REUTILIZADA','A chave foi usada com outro resultado mock.');

      return { 
        repetido:true, 
        pagamento:repetido, 
        pedido:await tx.pedido.findUniqueOrThrow( { where:{ id:pedidoId } } ) 
      };

    }
    if ( !( [ StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.PAGAMENTO_RECUSADO ] as StatusPedido[] ).includes(pedido.status) ) {

      throw new ApiError(409,'PEDIDO_NAO_PAGAVEL','Pedido já pago, cancelado ou em atendimento.');

    }

    if (entrada.resultadoMock==='APROVADO') {

      for ( const item of pedido.itens ) {

        const alterados=await tx.estoque.updateMany(
          {
            where:{
              unidadeId:pedido.unidadeId,
              produtoId:item.produtoId,
              quantidade:{
                gte:item.quantidade
              }
            },
            data:{
              quantidade:{decrement:item.quantidade}
            }
          }
        );

        if (alterados.count !==1 ) throw new ApiError(409, 'ESTOQUE_INSUFICIENTE', `Sem estoque para produto ${item.produtoId} no momento da confirmação.`);

      }

      const atualizado=await tx.pedido.updateMany(
          {where:{
            id:pedidoId,
            status:{
              in:['AGUARDANDO_PAGAMENTO', 'PAGAMENTO_RECUSADO']
            }
          },
          data:{ status:'PAGO' }
        }
      );

      if (atualizado.count !==1 ) throw new ApiError( 409, 'CONCORRENCIA', 'O pedido foi alterado por outra operação.');

    } else if ( entrada.resultadoMock === 'RECUSADO') {

      const atualizado=await tx.pedido.updateMany(
        {
          where:{
            id:pedidoId,
            status:{
              in:['AGUARDANDO_PAGAMENTO','PAGAMENTO_RECUSADO']
            }
          },
          data:{ status:'PAGAMENTO_RECUSADO' }
        }
      );

      if (atualizado.count !==1 ) throw new ApiError(409,'CONCORRENCIA','O pedido foi alterado por outra operação.');

    }

    const pagamento = await tx.pagamento.create( 
      {
        data:{
          pedidoId,
          chaveIdempotencia:entrada.chaveIdempotencia,
          status:entrada.resultadoMock,
          resultadoSimulado:entrada.resultadoMock,
          valor:pedido.total
        }
      }
    );

    await tx.auditoria.create(
      {
        data:{
          atorId:usuario.id,
          acao:'PAGAMENTO_MOCK_' + entrada.resultadoMock,
          entidade:'PEDIDO', 
          entidadeId:pedidoId,
          unidadeId:pedido.unidadeId,
          dados:{
            pagamentoId:pagamento.id,
            resultado:entrada.resultadoMock
          }
        }
      }
    );

    const pedidoAtualizado = await tx.pedido.findUniqueOrThrow( { where:{ id:pedidoId } });

    return { 
      repetido:false,
      pagamento,
      pedido:pedidoAtualizado
    };

  }, { isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted, timeout:15000 } );

}
