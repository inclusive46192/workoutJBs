<#
.SYNOPSIS
  Setzt die beiden Auth-E-Mail-Vorlagen ueber die Supabase Management API.

.DESCRIPTION
  Alternative zum Dashboard: falls sich die Vorlagen dort nicht bearbeiten
  lassen, schreibt dieses Skript sie direkt ueber die API.

  Gesetzt werden genau die zwei Vorlagen, die fuer die Code-Anmeldung noetig
  sind:
    - "Magic Link"     -> mailer_templates_magic_link_content
    - "Confirm signup" -> mailer_templates_confirmation_content

  Der HTML-Kommentarblock am Dateianfang ist nur Begruendung fuer Menschen und
  wird vor dem Senden entfernt.

  Das Token wird bewusst NICHT als Parameter genommen, damit es nicht in der
  PowerShell-History landet.

.PARAMETER ProjectRef
  Die Projekt-ID, z. B. "abcdefghijklmnop".
  Zu finden unter Project Settings -> General -> Reference ID,
  oder in der Dashboard-URL: /dashboard/project/<HIER>/...

.PARAMETER WhatIf
  Zeigt nur, was gesendet wuerde, ohne die Aenderung auszufuehren.

.EXAMPLE
  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
  .\set-email-templates.ps1 -ProjectRef abcdefghijklmnop

.NOTES
  Access Token erzeugen: https://supabase.com/dashboard/account/tokens
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
    throw "SUPABASE_ACCESS_TOKEN ist nicht gesetzt. Token unter https://supabase.com/dashboard/account/tokens erzeugen, dann:  `$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'"
}

function Get-TemplateBody {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Vorlage nicht gefunden: $Path"
    }
    $html = Get-Content -LiteralPath $Path -Raw
    # Fuehrenden Erklaerungs-Kommentar entfernen - der gehoert nicht in die Mail.
    $html = [regex]::Replace($html, '(?s)^\s*<!--.*?-->\s*', '')
    return $html.Trim()
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$magicLink = Get-TemplateBody (Join-Path $here 'email-magic-link.html')
$confirm = Get-TemplateBody (Join-Path $here 'email-confirm-signup.html')

foreach ($pair in @(@{ n = 'Magic Link'; v = $magicLink }, @{ n = 'Confirm signup'; v = $confirm })) {
    if ($pair.v -notmatch '\{\{\s*\.Token\s*\}\}') {
        throw "In der Vorlage '$($pair.n)' fehlt {{ .Token }} - ohne diesen Platzhalter kommt kein Code an."
    }
}

$payload = [ordered]@{
    mailer_subjects_magic_link           = 'Dein Momentum-Anmeldecode'
    mailer_templates_magic_link_content  = $magicLink
    mailer_subjects_confirmation         = 'Momentum Journal - Konto bestaetigen'
    mailer_templates_confirmation_content = $confirm
}

$uri = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"

Write-Host "Ziel:      $uri"
Write-Host "Magic Link:     $($magicLink.Length) Zeichen"
Write-Host "Confirm signup: $($confirm.Length) Zeichen"

if (-not $PSCmdlet.ShouldProcess($ProjectRef, 'E-Mail-Vorlagen setzen')) {
    return
}

$response = Invoke-RestMethod -Method Patch -Uri $uri -Headers @{
    Authorization  = "Bearer $token"
    'Content-Type' = 'application/json'
} -Body ($payload | ConvertTo-Json -Depth 4)

Write-Host ''
Write-Host 'Gesetzt. Kontrolle der gespeicherten Werte:' -ForegroundColor Green
foreach ($key in @('mailer_subjects_magic_link', 'mailer_subjects_confirmation')) {
    Write-Host ("  {0} = {1}" -f $key, $response.$key)
}
$stored = $response.mailer_templates_magic_link_content
Write-Host ("  Magic-Link-Vorlage enthaelt Code-Platzhalter: {0}" -f ($stored -match '\{\{\s*\.Token\s*\}\}'))
Write-Host ("  Magic-Link-Vorlage enthaelt noch einen Link:  {0}" -f ($stored -match 'ConfirmationURL'))
