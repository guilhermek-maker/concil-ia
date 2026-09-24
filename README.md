# CONCIL-IA — código-fonte completo

Este pacote contém o código da versão publicada após a remoção dos dados demonstrativos e a ampliação da importação. Os arquivos em `dist/` são código-fonte editável, apesar do nome da pasta; não há compilação, framework obrigatório nem instalação de dependências.

## Executar no seu computador

Com Node.js 18 ou superior instalado, extraia o ZIP, abra um terminal na pasta `CONCIL-IA-codigo-fonte` e execute:

```sh
npm start
```

Abra **http://127.0.0.1:3000**. Também funciona executar `node server.mjs`. O servidor escuta apenas no computador local.

Alternativa com Python 3, sem Node:

```sh
python -m http.server 3000 --bind 127.0.0.1 --directory dist
```

Use HTTP local em vez de dar duplo clique no HTML: o leitor de PDF precisa carregar módulos e um Web Worker. As bibliotecas já estão incluídas; os documentos não são enviados a um leitor externo.

## Arquivos para editar

| Arquivo | Responsabilidade |
|---|---|
| `dist/index.html` | Página inicial, metadados e ordem dos scripts |
| `dist/style.css` | Visual, temas escuro/claro e responsividade |
| `dist/app.js` | Dashboard, pedidos, regras de conciliação, migração dos dados fictícios, auditoria, fechamento e relatórios |
| `dist/importer.js` | Importação multiformato, extração de PDF, mapeamento e validação |
| `dist/agent-tools.js` | Integração opcional WebMCP; navegadores sem suporte usam a interface normal |
| `dist/vendor/` | SheetJS e PDF.js, incluindo o worker e as licenças |
| `.openai/hosting.json` | Identificação do site existente para futuras publicações no Sites |
| `server.mjs` | Servidor local sem dependências |
| `package.json` | Atalhos de execução e verificação |

Não altere a ordem dos scripts sem revisar as dependências entre eles. Preserve `vendor/` e as licenças ao distribuir o projeto. A configuração `.openai/hosting.json` não contém senha ou token; preserve seu `project_id` para atualizar o mesmo site. Em outra hospedagem, publique a pasta `dist/`; a configuração `.openai/` não é necessária lá.

## Verificação rápida

```sh
npm run check
```

Esse comando verifica a sintaxe, mas não substitui os testes no navegador. Antes de devolver uma alteração, teste os temas, navegação, importação de uma planilha, mapeamento, confirmação de vínculo e fechamento/reabertura. Use documentos de teste sem informações sensíveis. Não publique dados fictícios dentro da base inicial.

## Formatos e limites atuais

- CSV, TSV e TXT delimitado; XLSX, XLS e ODS, com seleção de aba e mapeamento de colunas.
- PDF com texto selecionável: extração assistida e revisão obrigatória. PDFs escaneados precisam de OCR externo; documentos protegidos não são lidos.
- Até 20 MB por arquivo, 10.000 linhas por importação e 100 páginas por PDF. A tabela padronizada enviada à validação também deve respeitar o limite de 5 MB.
- A leitura de qualquer formato não garante interpretação automática de qualquer layout. Conferir a prévia é obrigatório.
- A investigação usa regras locais; não há API de IA conectada. Não há sincronização automática com os marketplaces.

## Dados e acesso

Os registros ficam no `localStorage` do navegador, na chave `concilia-v1-local`. Não existe banco em nuvem nem sincronização entre dispositivos. O arquivo original importado não é arquivado. Exporte backups pela aplicação antes de mexer em regras de armazenamento.

O site publicado tem controle de acesso fornecido pelo Sites. Esse controle **não acompanha o servidor local nem uma cópia hospedada em outro provedor**. O código não implementa login próprio. Para uso compartilhado ou financeiro em produção, ainda é necessário desenvolver armazenamento central, autorização e auditoria apropriados.

Uma origem diferente (outro endereço, porta ou navegador) tem uma base independente. O pacote não contém seus registros importados, arquivos financeiros, dados de navegador, credenciais, histórico Git ou chaves de API. Exportação de backup existe; restauração do backup pela interface ainda não está implementada.

## Como devolver o código atualizado aqui

1. Faça uma cópia do projeto e edite os arquivos necessários.
2. Confira o funcionamento localmente.
3. Compacte a pasta e anexe o ZIP nesta conversa, explicando o que mudou e se deseja publicar.
4. Para uma alteração pequena, você pode colar o código, indicando **o caminho exato do arquivo** e se é o arquivo completo ou apenas um trecho. Não cole as bibliotecas grandes de `vendor/`.

Não inclua `.env`, tokens, senhas, chaves, `node_modules`, `.git` ou documentos reais no pacote de código. Se modificar estrutura de dados ou armazenamento, avise para que a atualização preserve os registros existentes. Só colar ou anexar código não atualiza o site automaticamente: é necessário integrar, verificar e publicar a alteração.

## Origem desta entrega

Site: https://concil-ia-klemann.gklemann.chatgpt.site

Revisão publicada: `539b002b931cf076ad0aa3cad109d38199be52d6`.

`SHA256SUMS.txt` registra as assinaturas dos arquivos deste pacote. As licenças dos componentes de terceiros estão em `dist/vendor/`.
