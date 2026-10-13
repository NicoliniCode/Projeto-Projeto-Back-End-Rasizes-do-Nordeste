import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api } from './api/routes';
import { errorHandler, ApiError } from './api/errors';

export function criarApp() {

  const app=express();

  app.use( helmet( { contentSecurityPolicy:false } ));
  app.use( cors() ); 
  app.use( express.json( {limit:'32kb'} ));

  const spec =  YAML.parse( readFileSync( resolve( process.cwd(), 'docs', 'openapi.yaml'), 'utf8') );

  app.use(  '/api/docs', swaggerUi.serve, swaggerUi.setup(spec) );
  app.get(  '/api/openapi.json', ( _req, res) => res.json(spec) );
  app.use(  '/api', api );
  app.use( (_req ,_res, next) => next( new ApiError( 404,'ROTA_NAO_ENCONTRADA','Rota inexistente.') ));
  app.use( errorHandler );

  return app;
  
}
