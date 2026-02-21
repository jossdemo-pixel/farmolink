param(
    [string]$ProjectRef = "hbnomhpgfigenobcmqsm"
)

$ErrorActionPreference = "Stop"

Write-Host "== FarmoLink: Setup Edge Functions ==" -ForegroundColor Cyan
Write-Host "Projeto Supabase: $ProjectRef"

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "Node/NPM nao encontrado. Instale Node.js 20+."
}

Write-Host "`n1) Validando Supabase CLI via npx..." -ForegroundColor Yellow
npx supabase --version | Out-Host

Write-Host "`n2) Credenciais Supabase" -ForegroundColor Yellow
$supabaseToken = Read-Host "Cole o SUPABASE_ACCESS_TOKEN (Personal Access Token)"
if ([string]::IsNullOrWhiteSpace($supabaseToken)) {
    throw "SUPABASE_ACCESS_TOKEN obrigatorio."
}

$env:SUPABASE_ACCESS_TOKEN = $supabaseToken

Write-Host "`n3) Ligando pasta ao projeto Supabase..." -ForegroundColor Yellow
npx supabase link --project-ref $ProjectRef | Out-Host

Write-Host "`n4) Secrets da Edge Function" -ForegroundColor Yellow
$apiKey = Read-Host "API_KEY (Gemini)"
$fcmProjectId = Read-Host "FCM_PROJECT_ID (Firebase Project ID)"
$fcmClientEmail = Read-Host "FCM_CLIENT_EMAIL (service account email)"

Write-Host ""
Write-Host "Agora cole a FCM_PRIVATE_KEY completa." -ForegroundColor DarkYellow
Write-Host "Quando terminar, digite apenas: END" -ForegroundColor DarkYellow
$privateKeyLines = @()
while ($true) {
    $line = Read-Host
    if ($line -eq "END") { break }
    $privateKeyLines += $line
}
$fcmPrivateKeyRaw = ($privateKeyLines -join "`n").Trim()

if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "API_KEY obrigatorio." }
if ([string]::IsNullOrWhiteSpace($fcmProjectId)) { throw "FCM_PROJECT_ID obrigatorio." }
if ([string]::IsNullOrWhiteSpace($fcmClientEmail)) { throw "FCM_CLIENT_EMAIL obrigatorio." }
if ([string]::IsNullOrWhiteSpace($fcmPrivateKeyRaw)) { throw "FCM_PRIVATE_KEY obrigatorio." }

$fcmPrivateKeyEscaped = $fcmPrivateKeyRaw -replace "`r?`n", "\n"

$secretsFile = ".supabase.secrets.tmp"
@"
API_KEY=$apiKey
FCM_PROJECT_ID=$fcmProjectId
FCM_CLIENT_EMAIL=$fcmClientEmail
FCM_PRIVATE_KEY=$fcmPrivateKeyEscaped
"@ | Set-Content -Path $secretsFile -Encoding UTF8

try {
    Write-Host "`n5) Enviando secrets..." -ForegroundColor Yellow
    npx supabase secrets set --project-ref $ProjectRef --env-file $secretsFile | Out-Host
}
finally {
    if (Test-Path $secretsFile) { Remove-Item $secretsFile -Force }
}

Write-Host "`n6) Deploy de functions..." -ForegroundColor Yellow
npx supabase functions deploy push-dispatch --project-ref $ProjectRef | Out-Host
npx supabase functions deploy gemini --project-ref $ProjectRef | Out-Host

Write-Host "`nConcluido." -ForegroundColor Green
Write-Host "Reinicie o frontend: npm run dev"
