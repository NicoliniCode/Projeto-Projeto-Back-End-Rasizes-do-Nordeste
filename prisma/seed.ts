import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Perfil, Prisma } from '@prisma/client';

const prisma=new PrismaClient();

async function main() {
  
  if ( process.env.NODE_ENV==='production' ) throw new Error('Seed com usuários de demonstração proibido em produção.');
  const unidade1=await prisma.unidade.upsert({where:{id:1},create:{id:1,nome:'Recife - Centro',cidade:'Recife'},update:{nome:'Recife - Centro',ativo:true}});
  const unidade2=await prisma.unidade.upsert({where:{id:2},create:{id:2,nome:'Olinda - Centro',cidade:'Olinda'},update:{nome:'Olinda - Centro',ativo:true}});
  const produtos=[
    {
      id:101,
      nome:'Cuscuz com queijo',
      preco:'19.90'
    }, 
    {
      id:102,
      nome:'Tapioca de carne de sol',
      preco:'24.90'},
      {
        id:103,
        nome:'Suco de cajá',
        preco:'9.90'
      }
    ];

  for (const p of produtos) {

    await prisma.produto.upsert(
      {
        where:{
          id:p.id
        },
        create:{
          id:p.id,
          nome:p.nome
        },
        update:{
          nome:p.nome,
          ativo:true
        }
      }
    );

    for ( const unidade of [ unidade1, unidade2] ) {

      await prisma.itemCardapio.upsert( 
        {
          where:{
            unidadeId_produtoId:{
              unidadeId:unidade.id,
              produtoId:p.id
            }
          }, 
          create:{
            unidadeId:unidade.id,
            produtoId:p.id,
            preco:new Prisma.Decimal( p.preco) 
          },
          update:{
            preco:new Prisma.Decimal(p.preco),
            disponivel:true
          }
        }
      );

      await prisma.estoque.upsert(
        {
          where:{
            unidadeId_produtoId:{
              unidadeId:unidade.id,
              produtoId:p.id
            }
          },
          create:{
            unidadeId:unidade.id,
            produtoId:p.id,
            quantidade:30
          },
          update:{}
        }
      );

    }

  }

  const usuarios = [
    { id:1,
      nome:'Administrador Demo',
      email:'admin@raizes.local',
      perfil:Perfil.ADMIN,
      unidadeId:null,
      senha:'Admin123!'},
    { id:2,
      nome:'Cliente Demo',
      email:'cliente@raizes.local',
      perfil:Perfil.CLIENTE,
      unidadeId:null,
      senha:'Cliente123!'},
    { id:3,
      nome:'Cozinha Recife',
      email:'cozinha@raizes.local',
      perfil:Perfil.COZINHA
      ,unidadeId:1,
      senha:'Cozinha123!'},
    { id:4,
      nome:'Atendente Recife',
      email:'atendente@raizes.local',
      perfil:Perfil.ATENDENTE,
      unidadeId:1,
      senha:'Atendente123!'},
    { id:5,
      nome:'Gerente Recife',
      email:'gerente@raizes.local',
      perfil:Perfil.GERENTE,
      unidadeId:1,
      senha:'Gerente123!'},
    { id:6,
      nome:'Outro Cliente',
      email:'cliente2@raizes.local',
      perfil:Perfil.CLIENTE,
      unidadeId:null,
      senha:'Cliente2123!'
    }
  ];

  for( const u of usuarios) {

    const senhaHash = await bcrypt.hash( u.senha, 12 );

    await prisma.usuario.upsert(
      {
        where:{
          id:u.id
        },
        create:{
          id:u.id,
          nome:u.nome,
          email:u.email,
          perfil:u.perfil,
          unidadeId:u.unidadeId,
          senhaHash
        },
        update:{
          nome:u.nome,
          email:u.email,
          perfil:u.perfil,
          unidadeId:u.unidadeId,
          senhaHash,
          ativo:true
        }
      }
    );
  }

  console.log('Seed concluído (estoques existentes NÃO são reinicializados). Credenciais no README.');
}
main().finally( () => prisma.$disconnect()).catch( e => {console.error(e); process.exitCode = 1; } );
