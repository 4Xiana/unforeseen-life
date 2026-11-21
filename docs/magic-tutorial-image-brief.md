# 新手教程魔术示意图

状态：图片设计已准备，尚未生成或接入页面。当前会话未提供内置 image_gen 工具；备用 API/CLI 模式须经用户明确确认后使用。

## 内容与位置

- 推荐卡保留「学会一个能表演给朋友的小魔术」。
- 选中后，以「橡皮筋跳指」的三步图片替换原数字预测说明和演算记录。
- 三个画面：橡皮筋套住食指和中指；掌心视角展示握拳时四个指尖进入拉开的皮筋圈；张手后橡皮筋移到无名指和小指。
- 图外使用一句正文说明动作，一句小字标明「教程示意」，避免图片内多层标题与说明。
- 保留练习不保存提示、辅助对话说明与练习提交按钮，仍为两次点击流程。
- 图片以完整比例显示，手机不裁切关键手势；设置尺寸避免加载跳动，并提供替代文本。选中任务后先让图片进入可见区域，避免直接滚到提交按钮而跳过教程图。

动作参考：魔术师 Ben Nemzer 的公开教学《How to Do the Jumping Rubber Band Magic Trick》：https://howcast.com/videos/473190-how-to-do-the-jumping-rubber-band-trick-card-tricks/

## 图片生成提示词

Use case: scientific-educational.

Create one polished, original illustrated tutorial image for an adult lifestyle exploration app. The subject is the classic jumping rubber band trick. Portrait composition, approximately 3:4 aspect ratio, three equally sized horizontal panels stacked vertically, with generous cream margins and thin unobtrusive separators. The surrounding app uses warm ivory (#FDFBF7), moss green (#4F6B36), charcoal, and soft sage. Use a restrained editorial illustration style: anatomically accurate natural hands, fine clean contours, soft shading, warm skin tones, and one clearly visible moss-green elastic band. No cartoon mascot, decorative stars, playing cards, stage hats, or glitter.

Panel 1: a close-up of the back of one left hand held upright, wrist at the bottom. The thumb is on the right side of the image. A single rubber band encircles only the index and middle fingers near their bases. Clearly show all five digits.

Panel 2: an explanatory palm-side view of the same left hand. The hand is curled into a fist; all four fingertips except the thumb are tucked under and inside the stretched palm-side section of the same band. Make the rubber band's continuous path legible and the secret setup understandable. The assisting right hand can gently stretch the band to show the setup. Keep anatomically correct fingers and distinct hands.

Panel 3: return to the same back-of-hand viewpoint as panel 1, all fingers straightened. The rubber band now encircles only the ring and little fingers near their bases. Use one small, subtle curved motion arrow to suggest the transfer, without adding a second band or ghost fingers.

Every panel should clearly communicate a different real hand position. Keep important fingertips and the band well inside the image borders. No words, numbers, labels, logos, watermarks, UI chrome, or embedded captions: accessible Chinese captions will be rendered by the app outside the image. This is a tutorial mock illustration rather than evidence of a user's performance.

## 验收

- 先检查手指数、皮筋路径和三幅图的手势差异；不把错误手势当作完整教学。
- 图片压缩为适合移动端的 WebP，成品保存到产品 public/onboarding/ 目录。
- 保留16px正文／13px小字两级排版。
- 构建并回归四种屏幕尺寸的教程流程，再用共享浏览器查看选中后的图片、滚动与提交。
