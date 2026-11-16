param(
  [Parameter(Mandatory=$true)][string[]]$Name,
  [int]$Width = 1440,
  [int]$Height = 900,
  [double]$Scale = 2
)
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' }
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Split-Path -Parent $baseDir
$userDataDir = Join-Path $env:TEMP ('dsh-design-v02-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$q = '"'
foreach ($n in $Name) {
  $html = Join-Path $baseDir "$n.html"
  $png  = Join-Path $outDir "$n.png"
  if (-not (Test-Path $html)) { throw "missing $html" }
  if (Test-Path $png) { Remove-Item $png -Force }
  $uri = ([System.Uri]$html).AbsoluteUri
  $chromeArgs = @(
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars',
    "--force-device-scale-factor=$Scale","--window-size=$Width,$Height",
    "--user-data-dir=$q$userDataDir$q","--screenshot=$q$png$q",$uri
  )
  $p = Start-Process -FilePath $chrome -ArgumentList $chromeArgs -Wait -PassThru -NoNewWindow -ErrorAction SilentlyContinue
  if (-not (Test-Path $png)) { throw "render failed: $png (exit $($p.ExitCode))" }
  "rendered $n -> $((Get-Item $png).Length) bytes"
}
