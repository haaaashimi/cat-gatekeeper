param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('pause', 'resume')]
  [string]$Action,

  [string]$SessionsBase64 = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

function Await-WinRt {
  param(
    [Parameter(Mandatory = $true)]$Operation,
    [Parameter(Mandatory = $true)][Type]$ResultType
  )

  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethod -and
      $_.GetGenericArguments().Count -eq 1 -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1

  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Get-Fingerprint {
  param($Session)

  $properties = Await-WinRt ($Session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  return [PSCustomObject]@{
    source = $Session.SourceAppUserModelId
    title = [string]$properties.Title
    artist = [string]$properties.Artist
  }
}

function Fingerprints-Match {
  param($Left, $Right)

  return $Left.source -eq $Right.source -and
    $Left.title -eq $Right.title -and
    $Left.artist -eq $Right.artist
}

$manager = Await-WinRt ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = @($manager.GetSessions())
$result = @()

if ($Action -eq 'pause') {
  foreach ($session in $sessions) {
    try {
      if ($session.GetPlaybackInfo().PlaybackStatus.ToString() -ne 'Playing') {
        continue
      }

      $fingerprint = Get-Fingerprint $session
      $didPause = Await-WinRt ($session.TryPauseAsync()) ([bool])
      $hasSafeFingerprint = $fingerprint.source -and ($fingerprint.title -or $fingerprint.artist)
      if ($didPause -and $hasSafeFingerprint) {
        $result += $fingerprint
      }
    } catch {
      continue
    }
  }
} else {
  $targets = @()
  if ($SessionsBase64) {
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($SessionsBase64))
    $targets = @($json | ConvertFrom-Json)
  }

  foreach ($session in $sessions) {
    try {
      if ($session.GetPlaybackInfo().PlaybackStatus.ToString() -ne 'Paused') {
        continue
      }

      $fingerprint = Get-Fingerprint $session
      foreach ($target in $targets) {
        if (Fingerprints-Match $fingerprint $target) {
          [void](Await-WinRt ($session.TryPlayAsync()) ([bool]))
          break
        }
      }
    } catch {
      continue
    }
  }
}

ConvertTo-Json -InputObject @($result) -Compress
