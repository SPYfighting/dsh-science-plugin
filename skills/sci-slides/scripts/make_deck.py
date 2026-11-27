#!/usr/bin/env python3
"""从组会页面规划生成可编辑 PPTX。CLI 及 JSON 字段见同一 Skill 的 SKILL.md。"""

import argparse
import json
import os
import sys

try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
    from pptx.enum.shapes import MSO_SHAPE
except ImportError:
    sys.stderr.write("缺少依赖 python-pptx：请先运行 pip install python-pptx\n")
    sys.exit(2)

# ---- 版面常量（母版复用：所有页共用同一套坐标/字号/色板，不要逐页手调） ----
SLIDE_W_IN, SLIDE_H_IN = 13.333, 7.5           # 16:9
MARGIN_IN = 0.6                                 # 四周外边距
PIC_RATIO = 0.55                                # Results 页图区宽度占比（≥50% 纪律）
MAX_BULLETS = 5                                 # 每页要点上限（超限抛错）


INK = RGBColor(0x18, 0x20, 0x29)
ACCENT = RGBColor(0x16, 0x35, 0x57)
MUTED = RGBColor(0x41, 0x4B, 0x55)
FONT_LATIN, FONT_EA = "Times New Roman", "Microsoft YaHei"

TITLE_PT, BODY_PT, NOTE_PT = 30, 19, 13         # 层级字号：页标题/要点/图注


def _set_font(run, size, bold=False, color=INK):
    """统一设置拉丁 + 东亚字体（python-pptx 的 font.name 只管拉丁，东亚要写 rPr.ea）。"""
    f = run.font
    f.name = FONT_LATIN
    f.size = Pt(size)
    f.bold = bold
    f.color.rgb = color
    try:
        rPr = run._r.get_or_add_rPr()
        ea = rPr.find("{http://schemas.openxmlformats.org/drawingml/2006/main}ea")
        if ea is None:
            ea = rPr.makeelement("{http://schemas.openxmlformats.org/drawingml/2006/main}ea", {})
            rPr.append(ea)
        ea.set("typeface", FONT_EA)
    except Exception:
        pass


def _check_bullets(items, where):
    if len(items) > MAX_BULLETS:
        raise ValueError(f"{where} 要点 {len(items)} 条 > 上限 {MAX_BULLETS}：拆页或挪备份页（密度纪律）")
    return list(items)


def _textbox(slide, left, top, width, height):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    return tf


def _title(slide, text, color=ACCENT):
    """页标题（结论句）+ 标题下强调短线，全页共用坐标。"""
    tf = _textbox(slide, MARGIN_IN, 0.35, SLIDE_W_IN - 2 * MARGIN_IN, 0.9)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    _set_font(run, TITLE_PT, bold=True, color=color)
    bar = slide.shapes.add_shape(1, Inches(MARGIN_IN), Inches(1.28), Inches(1.6), Pt(3))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    bar.line.fill.background()


def _source_tag(slide, text):
    """右下角来源角标（res-N / fig-*），可溯源。"""
    if not text:
        return
    tf = _textbox(slide, MARGIN_IN, SLIDE_H_IN - 0.55, SLIDE_W_IN - 2 * MARGIN_IN, 0.45)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.RIGHT
    run = p.add_run()
    run.text = str(text)
    _set_font(run, NOTE_PT, color=MUTED)


def _bullets(slide, items, left, top, width, height, size=BODY_PT):
    items = _check_bullets(items, "本页")
    tf = _textbox(slide, left, top, width, height)
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run()
        run.text = f"• {item}"
        _set_font(run, size)
        p.space_after = Pt(10)
    return tf


def _picture_zone(slide, paths, left, top, width, height):
    """在给定区域内按原比例放置研究图件。无效引用须在写出成品前发现。"""
    from PIL import Image
    cell_h = height / len(paths)
    for i, path in enumerate(paths):
        if not os.path.isfile(path):
            raise ValueError(f"找不到汇报图件：{path}")
        with Image.open(path) as img:
            w, h = img.size
        scale = min(width / w, cell_h / h)
        draw_w, draw_h = w * scale, h * scale
        slide.shapes.add_picture(
            path, Inches(left + (width - draw_w) / 2),
            Inches(top + i * cell_h + (cell_h - draw_h) / 2),
            Inches(draw_w), Inches(draw_h),
        )


def new_deck():
    """16:9 空白演示文稿（页面一律用空白版式自绘，母版坐标由本模块常量统一）。"""
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W_IN)
    prs.slide_height = Inches(SLIDE_H_IN)
    return prs


def _blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def add_cover(prs, title, subtitle="", authors="", date=""):
    """封面：标题/副标题（场合或期刊）/作者/日期。只排入已提供的内容。"""
    s = _blank(prs)
    tf = _textbox(s, 1.2, 2.3, SLIDE_W_IN - 2.4, 2.0)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = title or "研究进展"
    _set_font(run, 40, bold=True, color=ACCENT)
    tf2 = _textbox(s, 1.2, 4.3, SLIDE_W_IN - 2.4, 1.6)
    for i, line in enumerate(x for x in (subtitle, authors, date) if x):
        p = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = line
        _set_font(run, 18, color=MUTED if i else ACCENT)
    return s


def add_background(prs, gap_points, claim=""):
    """背景与缺口（1-2 页之一）：要点 ≤5 + 底部主张框（claim 口语版）。"""
    s = _blank(prs)
    _title(s, "背景与缺口")
    _bullets(s, gap_points, MARGIN_IN, 1.6, SLIDE_W_IN - 2 * MARGIN_IN, 3.4)
    if claim:
        box = s.shapes.add_shape(1, Inches(MARGIN_IN), Inches(5.6),
                                 Inches(SLIDE_W_IN - 2 * MARGIN_IN), Inches(1.1))
        box.fill.solid()
        box.fill.fore_color.rgb = ACCENT
        box.line.color.rgb = ACCENT
        tf = box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = f"本工作主张：{claim}"
        _set_font(run, 20, bold=True, color=RGBColor(255, 255, 255))
    return s


def add_method(prs, one_liner, steps=()):
    """方法概览（1 页）：一句话路线 + 步骤要点（参数表进备份页，不进这里）。"""
    s = _blank(prs)
    _title(s, "方法概览")
    tf = _textbox(s, MARGIN_IN, 1.7, SLIDE_W_IN - 2 * MARGIN_IN, 1.4)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = one_liner
    _set_font(run, 22, bold=True, color=INK)
    if 2 <= len(steps) <= 4 and all(len(step) <= 18 for step in steps):
        gap = 0.58
        width = (SLIDE_W_IN - 2 * MARGIN_IN - gap * (len(steps) - 1)) / len(steps)
        for i, step in enumerate(steps):
            left = MARGIN_IN + i * (width + gap)
            node = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(3.4),
                                      Inches(width), Inches(1.15))
            node.fill.solid()
            node.fill.fore_color.rgb = ACCENT
            node.line.fill.background()
            node.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = node.text_frame.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            run = p.add_run()
            run.text = step
            _set_font(run, 18, color=RGBColor(255, 255, 255))
            if i + 1 < len(steps):
                arrow = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(left + width + .08),
                                           Inches(3.83), Inches(gap - .16), Inches(.28))
                arrow.fill.solid()
                arrow.fill.fore_color.rgb = ACCENT
                arrow.line.fill.background()
    else:
        _bullets(s, steps, MARGIN_IN, 3.3, SLIDE_W_IN - 2 * MARGIN_IN, 3.0)
    return s


def add_result(prs, title, bullets=(), figures=(), source=""):
    """Results 页：结论句作页标题；图区占右侧 55% 宽（≥50% 纪律）；文字只给导读。"""
    s = _blank(prs)
    _title(s, title or "本轮观察")
    content_w = SLIDE_W_IN - 2 * MARGIN_IN
    if figures and bullets:
        fig_w = content_w * PIC_RATIO
        text_w = content_w - fig_w - 0.3
        _bullets(s, bullets, MARGIN_IN, 1.8, text_w, 4.6)
        _picture_zone(s, figures, MARGIN_IN + text_w + 0.3, 1.6, fig_w, 4.9)
    elif figures:
        _picture_zone(s, figures, MARGIN_IN, 1.6, content_w, 4.9)
    else:
        _bullets(s, bullets, MARGIN_IN, 1.8, content_w, 4.6)
    _source_tag(s, source)
    return s


def add_conclusion(prs, takeaways, outlook=""):
    """本轮判断与下一步。"""
    s = _blank(prs)
    _title(s, "结论与展望")
    _bullets(s, takeaways, MARGIN_IN, 1.8, SLIDE_W_IN - 2 * MARGIN_IN, 3.2, size=22)
    if outlook:
        tf = _textbox(s, MARGIN_IN, 5.4, SLIDE_W_IN - 2 * MARGIN_IN, 1.0)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = f"下一步：{outlook}"
        _set_font(run, 18, color=ACCENT)
    return s


def add_backup(prs, title="统计细节（Q&A 备份）", rows=()):
    """备份页：统计细节/参数表（Q&A 弹药），表格逐格写不截图。"""
    s = _blank(prs)
    _title(s, title, color=ACCENT)
    rows = [list(map(str, r)) for r in rows]
    if rows and any(rows):
        n_r, n_c = len(rows), max(len(r) for r in rows)
        tbl = s.shapes.add_table(n_r, n_c, Inches(MARGIN_IN), Inches(1.8),
                                 Inches(SLIDE_W_IN - 2 * MARGIN_IN), Inches(min(0.5 * n_r, 4.8))).table
        for i, row in enumerate(rows):
            for j in range(n_c):
                cell = tbl.cell(i, j)
                cell.fill.solid()
                cell.fill.fore_color.rgb = ACCENT if i == 0 else RGBColor(255, 255, 255)
                cell.text = row[j] if j < len(row) else ""
                for p in cell.text_frame.paragraphs:
                    for run in p.runs:
                        _set_font(run, 16, bold=(i == 0), color=RGBColor(255, 255, 255) if i == 0 else INK)
    return s


def set_notes(slide, text):
    if not text:
        return
    frame = slide.notes_slide.notes_text_frame
    frame.text = text
    for paragraph in frame.paragraphs:
        for run in paragraph.runs:
            _set_font(run, 14)


def build_deck(spec):
    """保持既有 spec 字段；有内容的章节才生成页面。"""
    prs = new_deck()
    cover = spec.get("cover") or {}
    set_notes(add_cover(prs, cover.get("title"), cover.get("subtitle"),
                        cover.get("authors"), cover.get("date")), cover.get("notes"))
    bg = spec.get("background") or {}
    if bg.get("gap_points") or bg.get("claim"):
        set_notes(add_background(prs, bg.get("gap_points") or [], bg.get("claim")), bg.get("notes"))
    method = spec.get("method") or {}
    if method.get("one_liner") or method.get("steps"):
        set_notes(add_method(prs, method.get("one_liner") or "", method.get("steps") or []), method.get("notes"))
    for result in spec.get("results") or []:
        slide = add_result(prs, result.get("title"), result.get("bullets") or [],
                           result.get("figures") or [], result.get("source"))
        set_notes(slide, result.get("notes"))
    conclusion = spec.get("conclusion") or {}
    if conclusion.get("takeaways") or conclusion.get("outlook"):
        slide = add_conclusion(prs, conclusion.get("takeaways") or [], conclusion.get("outlook"))
        set_notes(slide, conclusion.get("notes"))
    backup = spec.get("backup") or {}
    if backup.get("rows"):
        set_notes(add_backup(prs, backup.get("title") or "统计细节", backup["rows"]), backup.get("notes"))
    return prs


def main(argv=None):
    ap = argparse.ArgumentParser(description="科研汇报 PPT 最小模板（python-pptx，蓝图驱动）")
    ap.add_argument("--out", required=True, help="输出 pptx 路径（建议 slides/ 目录）")
    ap.add_argument("--spec", help="页面规划 JSON 文件（字段见 SKILL.md；全部可缺省）")
    ap.add_argument("--title", help="封面标题（无 spec 时的极简路径）")
    ap.add_argument("--claim", help="核心主张（无 spec 时进背景页主张框）")
    ap.add_argument("--figure", action="append", default=[], help="登记图路径（可重复，进第 1 个 Results 页）")
    args = ap.parse_args(argv)

    if args.spec:
        with open(args.spec, "r", encoding="utf-8") as f:
            spec = json.load(f)
    else:
        spec = {
            "cover": {"title": args.title or ""},
            "background": {"gap_points": [], "claim": args.claim or ""},
            "method": {"one_liner": ""},
            "results": [{"title": "", "bullets": [], "figures": args.figure, "source": ""}] if args.figure else [],
        }
    prs = build_deck(spec)
    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    prs.save(args.out)
    # 自检：重新打开核对页数
    n = len(Presentation(args.out).slides)
    print(f"OK: {args.out}（{n} 页）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
