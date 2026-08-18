export function drawLongImagePageNumber(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  text: string,
  paperColor: string,
  textColor: string
): void {
  const fontSize = 24 * scale;
  const x = (width - 32) * scale;
  const y = (height - 24) * scale;
  context.save();
  context.font = `${fontSize}px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  const textWidth = context.measureText(text).width;
  const paddingX = 10 * scale;
  const paddingY = 4 * scale;
  const boxHeight = fontSize * 1.4 + paddingY * 2;
  context.globalAlpha = .86;
  context.fillStyle = paperColor;
  context.beginPath();
  context.roundRect(x - textWidth - paddingX * 2, y - boxHeight, textWidth + paddingX * 2, boxHeight, boxHeight / 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = textColor;
  context.fillText(text, x - paddingX, y - paddingY);
  context.restore();
}
