# Configuração do FlareSolverr

Este projeto agora usa o FlareSolverr para contornar a proteção do Cloudflare no site HLTV.

## Instalação e Execução do FlareSolverr

### Usando Docker (Recomendado)

```bash
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest
```

### Configuração

Por padrão, o FlareSolverr roda em `http://localhost:8191/v1`.

Se você precisar usar uma URL diferente, defina a variável de ambiente:

```bash
export FLARESOLVERR_URL=http://seu-servidor:8191/v1
```

## Verificação

Para verificar se o FlareSolverr está funcionando:

```bash
curl -X POST http://localhost:8191/v1 \
  -H "Content-Type: application/json" \
  -d '{
    "cmd": "request.get",
    "url": "https://www.hltv.org",
    "maxTimeout": 60000
  }'
```

## Instalação das dependências

Após clonar o projeto, execute:

```bash
npm install
```

## Build

```bash
npm run build
```

## Teste

```bash
npm start
```
