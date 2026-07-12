"""
Builds a single self-contained interactive HTML page (ECharts orthogonal tree)
visualizing the ENTIRE 52,486-node hierarchy, since a static image of a tree
this size would be unreadable. Deeper levels start collapsed and expand on
click so the browser only has to lay out what's actually visible.

Usage:
    python -m haiveminds_gen.export_graph_html --out hierarchy_graph.html
"""
import argparse
import json

from .db import get_conn


def load_children_map():
    with get_conn() as conn:
        rows = conn.execute("SELECT id, parent_id, level, message FROM nodes ORDER BY id;").fetchall()
    node_by_id = {}
    children_map: dict = {}
    for node_id, parent_id, level, message in rows:
        node_by_id[node_id] = {"level": level, "message": message}
        children_map.setdefault(parent_id, []).append(node_id)
    return node_by_id, children_map


def build_echarts_node(node_id: int, node_by_id: dict, children_map: dict) -> dict:
    info = node_by_id[node_id]
    return {
        "name": info["message"],
        "value": node_id,
        "depth": info["level"],
        "children": [
            build_echarts_node(child_id, node_by_id, children_map)
            for child_id in children_map.get(node_id, [])
        ],
    }


HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>haiveminds Message Hierarchy (__TOTAL__ nodes)</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
  html, body, #main { margin:0; padding:0; width:100%; height:100%; background:#0b0f14; }
  #info {
    position:fixed; top:10px; left:10px; color:#e5e7eb; font-family:'Segoe UI', sans-serif;
    font-size:13px; background:rgba(17,24,39,0.8); padding:10px 14px; border-radius:8px;
    z-index:10; max-width:360px; line-height:1.5;
  }
  #info b { color:#60a5fa; }
</style>
</head>
<body>
<div id="info">
  <div><b>haiveminds</b> Message Hierarchy</div>
  <div>__TOTAL__ nodes across 6 levels (0-5)</div>
  <div>Scroll/drag to pan &amp; zoom. Click a node to expand/collapse its branch. Hover for the full message.</div>
</div>
<div id="main"></div>
<script>
  const treeData = __TREE_DATA__;
  const chart = echarts.init(document.getElementById('main'), null, { renderer: 'canvas' });
  const levelColors = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  chart.setOption({
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      formatter: p => `<b>id:</b> ${p.data.value} &nbsp; <b>level:</b> ${p.data.depth}<br/>${p.name}`
    },
    series: [{
      type: 'tree',
      data: [treeData],
      top: '2%', left: '8%', bottom: '2%', right: '22%',
      orient: 'LR',
      symbol: 'circle',
      symbolSize: 6,
      label: {
        position: 'left', verticalAlign: 'middle', align: 'right',
        fontSize: 11, color: '#e5e7eb',
        formatter: p => truncate(p.name, 30)
      },
      leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
      itemStyle: { color: p => levelColors[p.data.depth % levelColors.length] },
      lineStyle: { color: '#374151', curveness: 0.5 },
      emphasis: { focus: 'ancestor' },
      expandAndCollapse: true,
      initialTreeDepth: 2,
      animationDuration: 400,
      animationDurationUpdate: 400,
      roam: true
    }]
  });

  window.addEventListener('resize', () => chart.resize());
</script>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="hierarchy_graph.html")
    args = parser.parse_args()

    node_by_id, children_map = load_children_map()
    root_ids = children_map.get(None, [])
    if not root_ids:
        print("No root node found in the database.")
        return
    root_id = root_ids[0]

    tree = build_echarts_node(root_id, node_by_id, children_map)
    total = len(node_by_id)

    html = (
        HTML_TEMPLATE
        .replace("__TOTAL__", f"{total:,}")
        .replace("__TREE_DATA__", json.dumps(tree, ensure_ascii=False))
    )

    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Wrote {args.out} ({total:,} nodes embedded).")


if __name__ == "__main__":
    main()
