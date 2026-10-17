"""Derive FlyTalk's articulated web model from the pinned flybody Blender source.

Usage (from the repository root):
  blender --background .research-tools/flybody-source/drosophila.blend \
    --python scripts/prepare_fly_asset.py -- --quality high
  blender --background .research-tools/flybody-source/drosophila.blend \
    --python scripts/prepare_fly_asset.py -- --quality low

This converts scientific source anatomy to a visual rig, not a biomechanical
simulation. Every animated node has canonical X/Y/Z axes and a meaningful
anatomical pivot; all rotations are identity except the folded wing rest pose.
Source geometry is retained, simplified, recolored and normalized. No network
access or Python package installation is needed by this exporter.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

REVISION = "d015e9bfe441bd90ae431bac24c55cb74bdbce26"
REPOSITORY = "https://github.com/TuragaLab/flybody"
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".research-tools" / "flybody-source"
OUTPUT = ROOT / "web" / "public" / "models" / "fly"
FOOT_HEIGHT = 0.34


def srgb(hex_color: str) -> tuple[float, float, float, float]:
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb) + (1.0,)


def material(name, color, roughness=0.5, metallic=0.0, alpha=1.0):
    mat = bpy.data.materials.new("Fly_" + name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    base = srgb(color)
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    bsdf.inputs["IOR"].default_value = 1.45
    mat.diffuse_color = (*base[:3], alpha)
    mat.use_backface_culling = False
    if alpha < 1:
        mat.surface_render_method = "DITHERED"
    return mat


def bounds(points):
    return {
        "min": [min(v[i] for v in points) for i in range(3)],
        "max": [max(v[i] for v in points) for i in range(3)],
    }


def rounding(values):
    return [round(float(v), 7) for v in values]


def build(quality):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    armature = bpy.data.objects["Armature"]
    originals = [o for o in bpy.data.objects if o.type == "MESH" and o.parent == armature]
    source_names = {o.name for o in originals}
    # Bone-parented meshes have already been evaluated in the source rest pose.
    source_points = {o.name: [o.matrix_world @ v.co for v in o.data.vertices] for o in originals}
    body_points = [p for name, points in source_points.items()
                   if name in {"head", "thorax"} or name.startswith("abdomen_") for p in points]
    body_length = max(p.x for p in body_points) - min(p.x for p in body_points)
    scale = 1.0 / body_length
    foot_min = min(p.z for name, points in source_points.items() if name.startswith("tarsal_claw") for p in points)
    thorax_points = source_points["thorax"]
    thorax_center_x = (max(p.x for p in thorax_points) + min(p.x for p in thorax_points)) / 2
    # The origin lies inside the ventral thorax, making the foot contract exact
    # without distorting the source anatomy with nonuniform scaling.
    source_origin = Vector((thorax_center_x, 0, foot_min + FOOT_HEIGHT / scale))
    orientation = Matrix(((0, -1, 0), (0, 0, 1), (-1, 0, 0)))

    def point(p):
        return (orientation @ (p - source_origin)) * scale

    pivots = {o.name: point(armature.matrix_world @ armature.pose.bones[o.parent_bone].head)
              for o in originals}
    pivots["thorax"] = Vector((0, 0, 0))
    parent_names = {}
    for obj in originals:
        bone = armature.data.bones[obj.parent_bone]
        ancestor = bone.parent
        while ancestor and ancestor.name not in source_names:
            ancestor = ancestor.parent
        parent_names[obj.name] = ancestor.name if ancestor else None
    parent_names["thorax"] = None

    # Split material surfaces before simplification, preserving thin wing veins
    # and bristles separately from the larger body/eye shells.
    surfaces = []
    for obj in originals:
        points = source_points[obj.name]
        for index, source_mat in enumerate(obj.data.materials):
            polygons = [p for p in obj.data.polygons if p.material_index == index]
            if not polygons:
                continue
            used = sorted({i for p in polygons for i in p.vertices})
            remap = {old: new for new, old in enumerate(used)}
            vertices = [point(points[i]) - pivots[obj.name] for i in used]
            faces = [[remap[i] for i in p.vertices] for p in polygons]
            surfaces.append({"part": obj.name, "material": source_mat.name,
                             "vertices": vertices, "faces": faces,
                             "sourceX": [points[i].x for i in used]})

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    mats = {
        "body": material("AmberCuticle", "a67743", 0.46),
        "lower": material("WarmUnderside", "c69a65", 0.56),
        "black": material("DarkBristles", "271c13", 0.62),
        "bristle-brown": material("Bristles", "48301c", 0.68),
        "brown": material("WingVeinsAndClaws", "674c29", 0.48),
        "red": material("RubyCompoundEyes", "bd2519", 0.29),
        "ocelli": material("Ocelli", "41150d", 0.16),
        "membrane": material("IridescentWingMembrane", "cce4db", 0.22, alpha=0.23),
        "stripe": material("AbdomenBands", "3c2818", 0.53),
    }
    mats["red"].node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.22
    mats["membrane"].node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.38

    root = bpy.data.objects.new("fly_root", None)
    bpy.context.collection.objects.link(root)
    root["sourceRepository"] = REPOSITORY
    root["sourceRevision"] = REVISION
    root["license"] = "Apache-2.0"
    root["visualModelOnly"] = True
    nodes = {}
    for name in sorted(source_names):
        node = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(node)
        nodes[name] = node
    for name, node in nodes.items():
        parent_name = parent_names[name]
        node.parent = nodes[parent_name] if parent_name else root
        node.location = pivots[name] - (pivots[parent_name] if parent_name else Vector())

    mesh_objects = []
    for surface in surfaces:
        name = f"{surface['part']}__{surface['material']}"
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(surface["vertices"], [], surface["faces"])
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = nodes[surface["part"]]
        mesh.materials.append(mats.get(surface["material"], mats["body"]))
        if surface["part"].startswith("abdomen_") and surface["material"] == "body":
            mesh.materials.append(mats["stripe"])
            xs = surface["sourceX"]
            cutoff = min(xs) + (max(xs) - min(xs)) * 0.70
            for poly in mesh.polygons:
                if sum(xs[i] for i in poly.vertices) / len(poly.vertices) > cutoff:
                    poly.material_index = 1
        for poly in mesh.polygons:
            poly.use_smooth = True
        if quality == "high":
            ratio = 0.48 if surface["material"] == "red" else 0.50
            if surface["material"] in {"black", "bristle-brown"}: ratio = 0.34
            if surface["material"] == "membrane": ratio = 1.0
            if surface["part"].startswith("wing_") and surface["material"] == "brown": ratio = 0.75
        else:
            ratio = 0.18 if surface["material"] == "red" else 0.24
            if surface["material"] in {"black", "bristle-brown"}: ratio = 0.14
            if surface["material"] == "membrane": ratio = 0.60
            if surface["part"].startswith("wing_") and surface["material"] == "brown": ratio = 0.38
        if len(mesh.polygons) > 60 and ratio < 1:
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new("WebSimplification", "DECIMATE")
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh_objects.append(obj)

    # Fold backward over the abdomen; flight animation opens these toward zero.
    nodes["wing_left"].rotation_euler.y = 1.20
    nodes["wing_right"].rotation_euler.y = -1.20
    bpy.context.view_layer.update()
    scene_points = [obj.matrix_world @ v.co for obj in mesh_objects for v in obj.data.vertices]
    triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in mesh_objects)
    filename = f"fly-{quality}.glb"
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / filename), export_format="GLB",
                             export_yup=False, export_animations=False, export_extras=True,
                             export_texcoords=False, export_normals=True, export_materials="EXPORT",
                             export_cameras=False, export_lights=False, export_apply=True)

    manifest_path = OUTPUT / "semantic-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest.update({
        "schemaVersion": 1,
        "source": {"repository": REPOSITORY, "revision": REVISION, "license": "Apache-2.0",
                   "bodySex": "female", "sourceFile": "flybody/fruitfly/assets/blender_model/drosophila.blend"},
        "coordinates": {"up": "+Y", "forward": "+Z", "anatomicalLeft": "+X",
                        "bodyLength": 1.0, "footHeight": FOOT_HEIGHT,
                        "origin": "ventral thorax; resting lowest foot is Y=-0.34",
                        "rotationConvention": "canonical world axes at rest; apply additive rotations to saved rest quaternion",
                        "unfoldedWingSpan": round(max(point(p).x for n, pts in source_points.items() if n.startswith("wing_") for p in pts)
                                                  - min(point(p).x for n, pts in source_points.items() if n.startswith("wing_") for p in pts), 6)},
        "semantics": {"root": "fly_root", "thorax": "thorax", "head": "head",
                      "abdomen": "abdomen_1", "abdomenSegments": [f"abdomen_{i}" for i in range(1, 9)],
                      "wingL": "wing_left", "wingR": "wing_right",
                      "antennaL": "antenna_left", "antennaR": "antenna_right",
                      "proboscis": "rostrum", "proboscisTip": "haustellum",
                      "mouthL": "labrum_left", "mouthR": "labrum_right",
                      "haltereL": "haltere_left", "haltereR": "haltere_right",
                      "legs": [{"side": side, "pair": pair, "hip": f"coxa_T{pair}_{side}",
                                "femur": f"femur_T{pair}_{side}", "tibia": f"tibia_T{pair}_{side}",
                                "foot": f"tarsus_T{pair}_1_{side}", "tip": f"tarsal_claw_T{pair}_{side}"}
                               for side in ("left", "right") for pair in range(1, 4)]},
        "nodes": {name: {"parent": obj.parent.name, "position": rounding(obj.location),
                         "rotationEulerXYZ": rounding(obj.rotation_euler),
                         "worldPivot": rounding(obj.matrix_world.translation)} for name, obj in nodes.items()},
        "materials": {k: v.name for k, v in mats.items()},
        "animationNotes": ["Wing rest Y rotations are +1.2 left, -1.2 right; unfold toward 0 for flight.",
                           "All other rest rotations are identity. Preserve translation and scale.",
                           "Source anatomy is articulated. Motion is authored; this is not the flybody physics simulation.",
                           "Perch contact requires root height 0.34 above the perch surface before procedural pose offsets."]
    })
    manifest.setdefault("variants", {})[quality] = {
        "url": f"/models/fly/{filename}", "triangles": triangles, "meshes": len(mesh_objects),
        "bytes": (OUTPUT / filename).stat().st_size,
        "sha256": hashlib.sha256((OUTPUT / filename).read_bytes()).hexdigest(),
        "bounds": bounds(scene_points),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "LICENSE-flybody.txt").write_bytes((SOURCE / "LICENSE").read_bytes())
    receipt = {
        "revision": REVISION, "repository": REPOSITORY,
        "files": [{"path": name, "sha256": hashlib.sha256((SOURCE / name).read_bytes()).hexdigest(),
                   "bytes": (SOURCE / name).stat().st_size}
                  for name in ("drosophila.blend", "fruitfly.xml", "LICENSE")],
        "tool": {"name": "Blender", "version": bpy.app.version_string},
    }
    (OUTPUT / "source-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("FLY_EXPORT", json.dumps(manifest["variants"][quality]))
    if quality == "high":
        preview(mesh_objects)


def preview(mesh_objects):
    """Generate review-only source images; these are excluded from the GLB."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.world.color = (0.14, 0.14, 0.14)
    scene.view_settings.view_transform = "AgX"
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, -0.343, 0), rotation=(math.pi / 2, 0, 0))
    floor = bpy.context.object
    floor.data.materials.append(material("ReviewFloor", "252d28", 0.82))

    def orient(obj, target):
        forward = (Vector(target) - obj.location).normalized()
        right = forward.cross(Vector((0, 1, 0))).normalized()
        up = right.cross(forward).normalized()
        obj.rotation_euler = Matrix((right, up, -forward)).transposed().to_euler()

    for pos, energy, color, size in [((1.2, 2.0, 1.7), 140, (1, .85, .65), 2),
                                     ((-1.8, 1.3, -.8), 180, (.55, .78, 1), 1.5),
                                     ((1, .8, -2), 110, (.8, 1, .8), 1)]:
        light = bpy.data.lights.new("ReviewLight", "AREA")
        light.energy, light.color, light.shape, light.size = energy, color, "DISK", size
        obj = bpy.data.objects.new("ReviewLight", light)
        bpy.context.collection.objects.link(obj)
        obj.location = pos
        orient(obj, (0, 0, 0))
    camera_data = bpy.data.cameras.new("ReviewCamera")
    camera = bpy.data.objects.new("ReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1.9
    for name, pos in [("three-quarter", (1.7, 1.1, 2.6)), ("side", (2.5, .6, .05)), ("top", (.05, 3.0, .05))]:
        camera.location = pos
        orient(camera, (0, -.02, -.12))
        scene.render.filepath = str(SOURCE / f"preview-{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--quality", choices=("high", "low"), required=True)
    build(parser.parse_args(args).quality)
