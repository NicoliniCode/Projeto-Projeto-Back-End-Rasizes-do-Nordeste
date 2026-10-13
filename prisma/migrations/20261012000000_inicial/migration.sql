-- Migração inicial PostgreSQL: gerada para acompanhar prisma/schema.prisma.
-- Todas as credenciais e pagamentos são apenas para ambiente acadêmico.
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'GERENTE', 'ATENDENTE', 'COZINHA', 'CLIENTE');
CREATE TYPE "CanalPedido" AS ENUM ('APP', 'TOTEM', 'BALCAO', 'PICKUP', 'WEB');
CREATE TYPE "StatusPedido" AS ENUM ('AGUARDANDO_PAGAMENTO', 'PAGAMENTO_RECUSADO', 'PAGO', 'EM_PREPARO', 'PRONTO', 'ENTREGUE', 'CANCELADO');
CREATE TYPE "StatusPagamento" AS ENUM ('APROVADO', 'RECUSADO', 'ERRO');

CREATE TABLE "Usuario" (
  "id" SERIAL NOT NULL, "nome" VARCHAR(120) NOT NULL,
  "email" VARCHAR(180) NOT NULL, "senhaHash" TEXT NOT NULL,
  "perfil" "Perfil" NOT NULL DEFAULT 'CLIENTE', "unidadeId" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unidade" (
  "id" SERIAL NOT NULL, "nome" VARCHAR(120) NOT NULL,
  "cidade" VARCHAR(120) NOT NULL, "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Unidade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Produto" (
  "id" SERIAL NOT NULL, "nome" VARCHAR(120) NOT NULL,
  "descricao" VARCHAR(500), "ativo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemCardapio" (
  "id" SERIAL NOT NULL, "unidadeId" INTEGER NOT NULL,
  "produtoId" INTEGER NOT NULL, "preco" DECIMAL(10,2) NOT NULL,
  "disponivel" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ItemCardapio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Estoque" (
  "id" SERIAL NOT NULL, "unidadeId" INTEGER NOT NULL,
  "produtoId" INTEGER NOT NULL, "quantidade" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Estoque_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pedido" (
  "id" SERIAL NOT NULL, "clienteId" INTEGER NOT NULL,
  "unidadeId" INTEGER NOT NULL, "canalPedido" "CanalPedido" NOT NULL,
  "status" "StatusPedido" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
  "total" DECIMAL(10,2) NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemPedido" (
  "id" SERIAL NOT NULL, "pedidoId" INTEGER NOT NULL,
  "produtoId" INTEGER NOT NULL, "quantidade" INTEGER NOT NULL,
  "precoUnitario" DECIMAL(10,2) NOT NULL, "subtotal" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pagamento" (
  "id" SERIAL NOT NULL, "pedidoId" INTEGER NOT NULL,
  "chaveIdempotencia" VARCHAR(120) NOT NULL,
  "status" "StatusPagamento" NOT NULL, "resultadoSimulado" VARCHAR(20) NOT NULL,
  "valor" DECIMAL(10,2) NOT NULL, "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Auditoria" (
  "id" SERIAL NOT NULL, "atorId" INTEGER,
  "acao" VARCHAR(80) NOT NULL, "entidade" VARCHAR(60) NOT NULL,
  "entidadeId" INTEGER NOT NULL, "unidadeId" INTEGER, "dados" JSONB,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
CREATE UNIQUE INDEX "ItemCardapio_unidadeId_produtoId_key" ON "ItemCardapio"("unidadeId", "produtoId");
CREATE INDEX "ItemCardapio_unidadeId_disponivel_idx" ON "ItemCardapio"("unidadeId", "disponivel");
CREATE UNIQUE INDEX "Estoque_unidadeId_produtoId_key" ON "Estoque"("unidadeId", "produtoId");
CREATE INDEX "Pedido_unidadeId_canalPedido_status_idx" ON "Pedido"("unidadeId", "canalPedido", "status");
CREATE INDEX "Pedido_clienteId_criadoEm_idx" ON "Pedido"("clienteId", "criadoEm");
CREATE UNIQUE INDEX "Pagamento_pedidoId_chaveIdempotencia_key" ON "Pagamento"("pedidoId", "chaveIdempotencia");
CREATE INDEX "Pagamento_pedidoId_idx" ON "Pagamento"("pedidoId");
CREATE INDEX "Auditoria_unidadeId_criadoEm_idx" ON "Auditoria"("unidadeId", "criadoEm");

ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemCardapio" ADD CONSTRAINT "ItemCardapio_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemCardapio" ADD CONSTRAINT "ItemCardapio_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Estoque" ADD CONSTRAINT "Estoque_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Estoque" ADD CONSTRAINT "Estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
