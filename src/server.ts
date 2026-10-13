import 'dotenv/config';
import { criarApp } from './app';
import { prisma } from './infra/prisma';

async function main() {

  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no arquivo .env');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET deve ter 32 caracteres ou mais.');
  await prisma.$connect();

  const porta = Number( process.env.PORT ?? 3000 );
  const server = criarApp().listen( porta, () => console.log(`API: http://localhost:${porta}/api | Swagger: http://localhost:${porta}/api/docs`) );
  const fechar = () => server.close( () => void prisma.$disconnect().finally( () => process.exit(0) ));

  process.on('SIGINT', fechar);
  process.on('SIGTERM', fechar);

}
main().catch( e => { console.error(e); process.exit(1); });
