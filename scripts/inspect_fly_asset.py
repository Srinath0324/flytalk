"""Run with Blender --background <source.blend> --python this_script."""
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def inspect():
    objects = []
    for obj in bpy.data.objects:
        entry = {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "parentBone": obj.parent_bone,
            "location": list(obj.location),
            "rotation": list(obj.rotation_euler),
            "scale": list(obj.scale),
            "dimensions": list(obj.dimensions),
            "worldBounds": [list(obj.matrix_world @ Vector(c)) for c in obj.bound_box],
        }
        if obj.type == "MESH":
            entry.update(vertices=len(obj.data.vertices), polygons=len(obj.data.polygons),
                         materials=[m.name if m else None for m in obj.data.materials],
                         modifiers=[{"name": m.name, "type": m.type} for m in obj.modifiers],
                         groups=[g.name for g in obj.vertex_groups])
        if obj.type == "ARMATURE":
            entry["bones"] = [{"name": b.name, "parent": b.parent.name if b.parent else None,
                              "head": list(b.head_local), "tail": list(b.tail_local)}
                             for b in obj.data.bones]
            entry["poseBones"] = [{"name": b.name, "head": list(b.head), "tail": list(b.tail)}
                                  for b in obj.pose.bones]
        objects.append(entry)
    result = {
        "blender": bpy.app.version_string,
        "objects": objects,
        "materials": [{"name": m.name, "diffuse": list(m.diffuse_color),
                       "nodes": [n.type for n in m.node_tree.nodes] if m.node_tree else []}
                      for m in bpy.data.materials],
        "actions": [{"name": a.name, "range": list(a.frame_range)} for a in bpy.data.actions],
    }
    output = Path(sys.argv[sys.argv.index("--") + 1])
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"FLY_INSPECTION {output} {len(objects)} objects")


inspect()
