// Plugin to draw vertical line at bedtime
export const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw: (chart) => {
    const { ctx, chartArea, scales } = chart
    const bedtime = chart.options.plugins?.verticalLine?.bedtime
    const chartHours = chart.options.plugins?.verticalLine?.chartHours || 24
    
    if (!bedtime || !chartArea) return
    
    // Convert bedtime to chart position
    const bedtimeHour = parseInt(bedtime.split(':')[0])
    const bedtimeMinute = parseInt(bedtime.split(':')[1]) || 0
    
    // Calculate the correct chart position
    let chartPosition
    if (chartHours > 24 && bedtimeHour < 12) {
      // Bedtime is next day in extended chart
      chartPosition = bedtimeHour + 24 + (bedtimeMinute / 60)
    } else {
      // Bedtime is same day
      chartPosition = bedtimeHour + (bedtimeMinute / 60)
    }
    
    const x = scales.x.getPixelForValue(chartPosition)
    
    // Draw vertical line
    ctx.save()
    ctx.strokeStyle = '#ef4444' // Red color
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5]) // Dashed line
    ctx.beginPath()
    ctx.moveTo(x, chartArea.top)
    ctx.lineTo(x, chartArea.bottom)
    ctx.stroke()
    
    // Add label
    ctx.fillStyle = '#ef4444'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Bedtime', x, chartArea.top - 10)
    ctx.restore()
  }
}

