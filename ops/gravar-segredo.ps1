# Grava o conteúdo da área de transferência como segredo do CONCIL-IA:
# no Supabase (usado pelas funções) e no GitHub (usado pela publicação automática).
# Uso: copie a credencial na plataforma e rode, por exemplo:
#   & "C:\Users\guilherme.klemann\Documents\CONCIL-IA\ops\gravar-segredo.ps1" BLING_CLIENT_SECRET
param([Parameter(Mandatory = $true)][string]$Nome)

$permitidos = 'ANTHROPIC_API_KEY','BLING_CLIENT_ID','BLING_CLIENT_SECRET','ML_CLIENT_ID','ML_CLIENT_SECRET',
  'SHOPEE_PARTNER_ID','SHOPEE_PARTNER_KEY','MAGALU_CLIENT_ID','MAGALU_CLIENT_SECRET','SUPABASE_ACCESS_TOKEN'
if ($permitidos -notcontains $Nome) { Write-Host "Nome inválido. Use um destes: $($permitidos -join ', ')"; exit 1 }

$valor = (Get-Clipboard | Out-String).Trim()
if (-not $valor) { Write-Host 'A área de transferência está vazia. Copie a credencial e rode de novo.'; exit 1 }

$supabase = 'C:\Users\guilherme.klemann\.tools\supabase.exe'
$ref = 'olxapwaxmzqclitlylzv'
if ($Nome -ne 'SUPABASE_ACCESS_TOKEN') {
  & $supabase secrets set --project-ref $ref "$Nome=$valor" | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar no Supabase.'; exit 1 }
}
$valor | gh secret set $Nome -R guilhermek-maker/concil-ia
Set-Clipboard -Value ' '
Write-Host "$Nome gravado ($($valor.Length) caracteres). Área de transferência limpa."
