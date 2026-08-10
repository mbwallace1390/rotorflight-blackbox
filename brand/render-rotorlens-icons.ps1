param(
    [Parameter(Mandatory = $true)]
    [string] $RepositoryRoot
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$brandDirectory = Join-Path $resolvedRoot 'brand'
$androidResourceRoot = Join-Path $resolvedRoot 'mobile/android/app/src/main/res'
$iosIconRoot = Join-Path $resolvedRoot 'mobile/ios/RotorflightBlackbox/Images.xcassets/AppIcon.appiconset'

foreach ($target in @($brandDirectory, $androidResourceRoot, $iosIconRoot)) {
    $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
    if (-not $resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to write outside repository: $resolvedTarget"
    }
}

function New-RoundedRectanglePath {
    param(
        [float] $X,
        [float] $Y,
        [float] $Width,
        [float] $Height,
        [float] $Radius
    )

    $diameter = $Radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-RotorLensMaster {
    # App Store icons may not contain an alpha channel, so the source and every
    # derivative use an opaque RGB pixel format.
    $bitmap = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $ink = [System.Drawing.ColorTranslator]::FromHtml('#101820')
        $panel = [System.Drawing.ColorTranslator]::FromHtml('#17242C')
        $line = [System.Drawing.ColorTranslator]::FromHtml('#3B4A52')
        $mist = [System.Drawing.ColorTranslator]::FromHtml('#F4F0E6')
        $teal = [System.Drawing.ColorTranslator]::FromHtml('#2CB5A0')
        $amber = [System.Drawing.ColorTranslator]::FromHtml('#F2A900')
        $bladeGray = [System.Drawing.ColorTranslator]::FromHtml('#66747B')

        $graphics.Clear($ink)

        $backgroundPath = New-RoundedRectanglePath -X 0 -Y 0 -Width 1024 -Height 1024 -Radius 224
        try {
            $graphics.FillPath([System.Drawing.SolidBrush]::new($ink), $backgroundPath)
        } finally {
            $backgroundPath.Dispose()
        }

        $lowerPanel = [System.Drawing.PointF[]] @(
            [System.Drawing.PointF]::new(0, 740),
            [System.Drawing.PointF]::new(1024, 504),
            [System.Drawing.PointF]::new(1024, 1024),
            [System.Drawing.PointF]::new(0, 1024)
        )
        $panelBrush = [System.Drawing.SolidBrush]::new($panel)
        try {
            $graphics.FillPolygon($panelBrush, $lowerPanel)
        } finally {
            $panelBrush.Dispose()
        }

        $discPen = [System.Drawing.Pen]::new($line, 34)
        try {
            $graphics.DrawEllipse($discPen, 212, 174, 600, 600)
        } finally {
            $discPen.Dispose()
        }

        $tracePen = [System.Drawing.Pen]::new($teal, 48)
        $tracePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $tracePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $tracePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        try {
            $trace = [System.Drawing.PointF[]] @(
                [System.Drawing.PointF]::new(124, 600),
                [System.Drawing.PointF]::new(334, 600),
                [System.Drawing.PointF]::new(406, 488),
                [System.Drawing.PointF]::new(514, 689),
                [System.Drawing.PointF]::new(616, 535),
                [System.Drawing.PointF]::new(684, 600),
                [System.Drawing.PointF]::new(900, 600)
            )
            $graphics.DrawLines($tracePen, $trace)
        } finally {
            $tracePen.Dispose()
        }

        foreach ($blade in @(
            @{ Color = $mist; Width = 64; Start = [System.Drawing.PointF]::new(150, 387); End = [System.Drawing.PointF]::new(874, 560) },
            @{ Color = $bladeGray; Width = 46; Start = [System.Drawing.PointF]::new(451, 164); End = [System.Drawing.PointF]::new(573, 786) }
        )) {
            $bladePen = [System.Drawing.Pen]::new($blade.Color, $blade.Width)
            $bladePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
            $bladePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
            try {
                $graphics.DrawLine($bladePen, $blade.Start, $blade.End)
            } finally {
                $bladePen.Dispose()
            }
        }

        $hubBrush = [System.Drawing.SolidBrush]::new($amber)
        $hubPen = [System.Drawing.Pen]::new($ink, 34)
        try {
            $graphics.FillEllipse($hubBrush, 445, 407, 134, 134)
            $graphics.DrawEllipse($hubPen, 445, 407, 134, 134)
        } finally {
            $hubBrush.Dispose()
            $hubPen.Dispose()
        }

        return $bitmap
    } finally {
        $graphics.Dispose()
    }
}

function Save-ScaledPng {
    param(
        [System.Drawing.Image] $Source,
        [int] $Size,
        [string] $Destination
    )

    $destinationDirectory = Split-Path -Parent $Destination
    [System.IO.Directory]::CreateDirectory($destinationDirectory) | Out-Null

    $scaled = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($scaled)
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($Source, 0, 0, $Size, $Size)
        $scaled.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $scaled.Dispose()
    }
}

$master = New-RotorLensMaster
try {
    Save-ScaledPng -Source $master -Size 1024 -Destination (Join-Path $brandDirectory 'rotorlens-app-icon-1024.png')
    Save-ScaledPng -Source $master -Size 128 -Destination (Join-Path $resolvedRoot 'images/rotorlens_icon_128.png')

    $androidSizes = @{
        'mipmap-mdpi' = 48
        'mipmap-hdpi' = 72
        'mipmap-xhdpi' = 96
        'mipmap-xxhdpi' = 144
        'mipmap-xxxhdpi' = 192
    }
    foreach ($entry in $androidSizes.GetEnumerator()) {
        $directory = Join-Path $androidResourceRoot $entry.Key
        Save-ScaledPng -Source $master -Size $entry.Value -Destination (Join-Path $directory 'ic_launcher.png')
        Save-ScaledPng -Source $master -Size $entry.Value -Destination (Join-Path $directory 'ic_launcher_round.png')
    }

    $iosSizes = @{
        'Icon-20@2x.png' = 40
        'Icon-20@3x.png' = 60
        'Icon-29@2x.png' = 58
        'Icon-29@3x.png' = 87
        'Icon-40@2x.png' = 80
        'Icon-40@3x.png' = 120
        'Icon-60@2x.png' = 120
        'Icon-60@3x.png' = 180
        'Icon-1024.png' = 1024
    }
    foreach ($entry in $iosSizes.GetEnumerator()) {
        Save-ScaledPng -Source $master -Size $entry.Value -Destination (Join-Path $iosIconRoot $entry.Key)
    }
} finally {
    $master.Dispose()
}

Write-Output 'Generated RotorLens Android and iOS icons.'
