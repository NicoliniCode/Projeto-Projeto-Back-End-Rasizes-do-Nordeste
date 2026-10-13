import { describe,it,expect } from 'vitest';
import { pedidoSchema,listaSchema,statusSchema } from '../src/services/pedidos';
import { pagamentoSchema } from '../src/services/pagamentos';

const valido = { 
                unidadeId:1, 
                canalPedido:'TOTEM',
                itens:[
                  {
                    produtoId:101,
                    quantidade:2
                  }
                ],
                formaPagamento:'MOCK'
              };

describe('Contratos e validações do MVP', () => {

  it('aceita pedido TOTEM válido', () => expect( pedidoSchema.safeParse(valido).success ).toBe(true) );
  it('rejeita canalPedido ausente', () => expect( pedidoSchema.safeParse( {...valido, canalPedido:undefined } ).success).toBe(false ));
  it('rejeita canalPedido fora do enum',() => expect( pedidoSchema.safeParse( {...valido, canalPedido:'WHATSAPP'} ).success).toBe(false) );
  it('rejeita quantidade negativa', () => expect( pedidoSchema.safeParse( {...valido, itens:[ { produtoId:101, quantidade:-1} ] } ).success).toBe(false) );
  it('rejeita produto duplicado no pedido', () => expect( pedidoSchema.safeParse( {...valido, itens:[ { produtoId:101,quantidade:1}, { produtoId:101, quantidade:2 } ] } ).success).toBe(false) );
  it('aceita filtro por canal e paginação', () => expect(listaSchema.parse({ canalPedido:'APP', page:'2', limit:'5' } ) ).toMatchObject( {page:2, limit:5 } ) );
  it('rejeita transição arbitrária no corpo da requisição',() => expect( statusSchema.safeParse( {status:'PAGO'} ).success).toBe(false) );
  it('rejeita chave de idempotência curta', () => expect(pagamentoSchema.safeParse( { chaveIdempotencia:'abc', resultadoMock:'APROVADO'} ).success).toBe(false) );
  
});
