# Gerador de Gabarito Online

Sistema web completo para:

- criar conta e entrar com login;
- salvar gabaritos no banco de dados;
- cadastrar prova com titulo, disciplina, turma e turno;
- corrigir a prova do aluno com a camera;
- salvar cada correcao com nome do aluno, turma, turno, disciplina e nota;
- manter historico online de gabaritos e correcoes.

## Tecnologias

- Frontend: HTML, CSS e JavaScript puro
- Backend: Node.js + Express
- Banco de dados: SQLite
- Autenticacao: JWT

## Rodando localmente

1. Instale as dependencias:

```powershell
npm install
```

2. Inicie o sistema:

```powershell
npm start
```

3. Abra no navegador:

```text
http://localhost:3000
```

## Estrutura principal

- `server.js`: servidor, autenticacao e API
- `app.js`: interface e integracao com API
- `styles.css`: visual do sistema
- `data/gabarito.db`: banco SQLite criado automaticamente
- `render.yaml`: configuracao pronta para deploy no Render

## Deploy online

O projeto ja esta preparado para publicacao no Render com disco persistente para o SQLite.

Passos:

1. Envie a pasta para um repositorio GitHub.
2. No Render, crie um novo Blueprint usando o arquivo `render.yaml`.
3. Aguarde o build.
4. O sistema ficara online com URL publica e banco persistente.

## Observacoes

- Para a camera funcionar, use `localhost` no ambiente local ou `https` em producao.
- A leitura automatica atual funciona melhor quando a folha estiver reta, centralizada e bem iluminada.
- O banco SQLite fica salvo na pasta `data/`.
