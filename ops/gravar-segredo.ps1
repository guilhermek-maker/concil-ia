# Grava uma credencial do CONCIL-IA no Supabase (usado pelas funções) e, se possível, no GitHub.
# Uso: powershell -ExecutionPolicy Bypass -File "...\ops\gravar-segredo.ps1" BLING_CLIENT_SECRET
# O valor é colado numa caixa de digitação oculta (Ctrl+V e Enter). Nada aparece na tela.
param([Parameter(Mandatory = $true)][string]$Nome)

# Tamanhos esperados para detectar cópia errada (mínimo, máximo).
$regras = @{
  'BLING_CLIENT_ID' = @(30, 60); 'BLING_CLIENT_SECRET' = @(30, 120)
  'ML_CLIENT_ID' = @(8, 30); 'ML_CLIENT_SECRET' = @(20, 60)
  'SHOPEE_PARTNER_ID' = @(4, 12); 'SHOPEE_PARTNER_KEY' = @(30, 100)
  'MAGALU_CLIENT_ID' = @(10, 80); 'MAGALU_CLIENT_SECRET' = @(10, 120)
  'ANTHROPIC_API_KEY' = @(40, 200)
}
if (-not $regras.ContainsKey($Nome)) { Write-Host "Nome inválido. Use um destes: $($regras.Keys -join ', ')"; exit 1 }

$seguro = Read-Host -AsSecureString "Cole o valor de $Nome (Ctrl+V) e aperte Enter"
$valor = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)).Trim()
$min, $max = $regras[$Nome]
if ($valor.Length -lt $min -or $valor.Length -gt $max -or $valor -match '\s') {
  Write-Host "O valor tem $($valor.Length) caracteres, mas $Nome costuma ter entre $min e $max, sem espaços. Parece que foi copiado o texto errado. Copie só o campo e tente de novo."
  exit 1
}

& 'C:\Users\guilherme.klemann\.tools\supabase.exe' secrets set --project-ref olxapwaxmzqclitlylzv "$Nome=$valor" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha ao gravar no Supabase. Avise o Claude.'; exit 1 }
Write-Host "OK: $Nome gravado no servidor ($($valor.Length) caracteres)."

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) { $valor | gh secret set $Nome -R guilhermek-maker/concil-ia 2>$null; if ($LASTEXITCODE -eq 0) { Write-Host 'Cópia também guardada no GitHub.' } }
$valor = $null