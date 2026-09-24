# CONCIL-IA

Versão operacional com base vazia. Site estático em `dist`, sem compilação. Sirva essa pasta via HTTP para carregar o leitor de PDFs.

Preserva dashboard, matching com confirmação, investigação por regras, auditoria local, fechamento e relatórios. Remove registros de origem Demonstração de bases anteriores, preserva Importado e reabre fechamentos contaminados por dados fictícios. Novos usuários começam sem registros.

Importação: CSV, TSV, TXT delimitado, XLSX, XLS e ODS, com seleção de aba, linha de cabeçalho e mapeamento de colunas. PDF com texto: extração de linhas e colunas, editor de revisão e mapeamento. Não há OCR; PDFs sem texto ou protegidos são recusados. Não promete interpretação universal de layouts. Valores negativos, estornos e rateios não são suportados pelo modelo atual. Limites: 20 MB por arquivo, 10.000 linhas, 100 páginas PDF.

Registros importados permanecem neste navegador. Os arquivos originais não são arquivados. Não há conexão real às plataformas, IA externa ou sincronização entre dispositivos. Exporte backups regularmente. Esta edição não substitui validação contábil nem um sistema com armazenamento central e auditoria inviolável.

Vínculos e fechamentos exigem confirmação na interface. A restrição de acesso do site é fornecida pela hospedagem.

WebMCP opcional: leitura de resumo e abertura de revisão; não confirma ações financeiras. Navegadores sem suporte usam a interface normal.

Leitores hospedados no próprio site: SheetJS CE 0.20.3 (Apache-2.0, https://docs.sheetjs.com/docs/getting-started/installation/standalone/) e PDF.js 5.6.205 (Apache-2.0, https://mozilla.github.io/pdf.js/). Nenhum documento é enviado a serviços externos para leitura.
