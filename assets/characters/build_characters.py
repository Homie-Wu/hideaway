"""Original HIDEAWAY character kit. Blender 4+; rebuild without external assets.
Game coordinates are X right, Y up, -Z forward. Blender conversion: (x,-z,y).
All exported meshes are joint-local with identity transforms. The runtime owns
the articulated skeleton and analytic arms/feet IK, so no skin is rebound.
"""
import bpy, math
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/models/characters'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name, rough, metallic):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bs=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if bs is None:
        bs=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output=m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(bs.outputs['BSDF'],output.inputs['Surface'])
    bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metallic
    a=m.node_tree.nodes.new('ShaderNodeVertexColor'); a.layer_name='Color'
    m.node_tree.links.new(a.outputs['Color'],bs.inputs['Base Color'])
    return m
cloth=material('Hunter cloth, leather and skin',.83,.015)
metal=material('Painted steel and walnut',.43,.28)
palette={'coat':0x377B78,'darkcoat':0x26534F,'coatlight':0x639B91,'skin':0xE7B48B,'cream':0xF4E2BC,'navy':0x34434B,'gold':0xE6AA4C,'leather':0x77523A,'sole':0x283637,'hair':0x382D29,'steel':0x3C5963,'lightsteel':0x98BABB,'black':0x21343B}
pieces=[]
def colorize(o, color):
    rgb=palette.get(color,color)
    if isinstance(rgb,int): rgb=tuple(((rgb>>s)&255)/255 for s in (16,8,0))
    # glTF vertex colors are linear, authored palette is sRGB.
    rgb=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)
    c=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for e in c.data:e.color=(*rgb,1)
    pieces.append(o);return o
def position(p):return (p[0],-p[2],p[1])
def box(p,s,c,bevel=.18):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position(p));o=bpy.context.object
    o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('Tailored soft edges','BEVEL');b.width=bevel;b.segments=2
        bpy.ops.object.modifier_apply(modifier=b.name)
        n=o.modifiers.new('Weighted panel normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=n.name)
    return colorize(o,c)
def ellipsoid(p,s,c):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=position(p));o=bpy.context.object
    o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return colorize(o,c)
def cylinder(p,r,length,c,axis='y',vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=length,location=position(p));o=bpy.context.object
    if axis=='z':o.rotation_euler.x=math.pi/2
    if axis=='x':o.rotation_euler.y=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return colorize(o,c)
def finish(name,mat=cloth):
    bpy.ops.object.select_all(action='DESELECT')
    for o in pieces:o.select_set(True)
    bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o.data.materials.clear();o.data.materials.append(mat)
    pieces.clear()

box((0,.2,0),(10.8,5,6.6),'navy',.65);box((0,2.4,0),(11.4,1.2,7),'leather',.16);box((0,2.4,-3.7),(2.5,1.5,.6),'gold',.1)
finish('hips-geometry')
box((0,9,0),(12.6,13.2,7.4),'coat',1.05);box((0,3.5,0),(13.3,2.4,8),'darkcoat',.5)
box((0,9.2,-3.75),(.55,11.5,.55),'gold',.12)
for x in [-3.6,3.6]:
    box((x,7.3,-4),(3.6,3.4,1.1),'darkcoat',.3);box((x,8.8,-4.4),(3.7,.6,.9),'coatlight',.12)
    cylinder((x,8.2,-4.7),.27,.2,'gold','z',8)
    box((x,12,-3.85),(.8,7.7,.6),'leather',.15)
box((0,15.5,0),(6.6,2.2,6.1),'gold',.6)
box((-1.2,13.5,-4),(2,4.3,.8),'gold',.25)
box((0,10,4.8),(8.7,11,3.5),'leather',.8);box((0,13,6.4),(8.4,3.4,.9),'gold',.35)
for x in [-2.4,2.4]:box((x,9.5,6.5),(.8,7,.6),'darkcoat',.12)
finish('torso-geometry')
cylinder((0,.2,0),2.15,2.4,'skin');finish('neck-geometry')
ellipsoid((0,.3,0),(5.1,4.5,4.4),'skin');ellipsoid((0,-2.3,-.7),(4.2,2.1,3.6),'skin')
for x in [-5,5]:ellipsoid((x,0,0),(.8,1.6,1.2),'skin')
ellipsoid((0,.1,-4.2),(1,1.3,1),'skin')
for x in [-2.3,2.3]:
    box((x,1.2,-4.05),(2,1.4,.5),'cream',.25);box((x+.2,1.1,-4.4),(.8,1,.3),'black',.1)
    box((x,2.45,-3.9),(2.4,.6,.7),'hair',.18)
box((0,-2.1,-4),(2.3,.35,.3),'leather',.1)
ellipsoid((0,2.5,.5),(5.15,2.7,4.45),'hair')
box((-4.6,.9,1.2),(.7,4.3,4.8),'hair',.25);box((4.6,.9,1.2),(.7,4.3,4.8),'hair',.25)
ellipsoid((0,5.45,.1),(5.6,1.25,4.9),'darkcoat')
box((0,4.75,-5.1),(10.4,.65,4.4),'darkcoat',.3)
box((0,5.6,-4.65),(2.3,1.4,.45),'gold',.25)
finish('head-geometry')
box((0,-4.6,0),(4.4,8.8,5.6),'navy',.75);box((2.1,-4.5,.2),(.7,3.2,3.8),'coatlight',.25);finish('thigh')
box((0,-3.3,0),(3.9,6.6,4.5),'navy',.6);box((0,-.5,-2.2),(3.7,2.8,.8),'darkcoat',.3);finish('shin')
box((0,-.4,-.9),(4.7,4.8,7.1),'leather',.75);box((0,-2.5,-1.2),(5.1,1,7.9),'sole',.3)
box((0,1.6,0),(4.2,.6,4.9),'gold',.18)
for y in [-.8,.15,.95]:box((0,y,-3.35),(3,.35,.5),'cream',.1)
finish('boot')
box((0,-3.9,0),(4.3,7.8,5.3),'coat',.9);ellipsoid((0,-.8,0),(2.5,1.8,2.75),'coatlight')
box((2.3,-2,0),(.5,2.8,2.9),'gold',.3);finish('sleeve')
box((0,-2.7,0),(3.8,5.4,4.5),'coat',.7);box((0,-5.2,0),(4.1,1.5,4.8),'coatlight',.3)
ellipsoid((0,-6.7,0),(1.65,1.7,1.8),'skin');finish('forearm')
box((0,-.6,0),(3.25,2.5,3),'leather',.55);ellipsoid((-1.5,-.1,-.65),(.65,1,.8),'skin')
for x in [-.95,0,.95]:box((x,-1.6,-.3),(.75,1.1,2.5),'skin',.22)
finish('glove')

def grip():
    box((0,0,0),(2,4.3,2.3),'leather',.35)
    for y in [-1.3,-.4,.5]:box((0,y,-1.2),(1.8,.3,.25),'gold',.08)
    box((0,-.9,-2.1),(1.6,.55,2.2),'black',.15)
grip();box((0,2.3,-3),(2.7,2.9,8),'steel',.35);box((0,3.3,-3),(2.75,1,8.1),'lightsteel',.18)
cylinder((0,2.3,-7.1),.85,1.9,'black','z');cylinder((0,2.3,-8.1),.52,.12,'black','z')
for z in [0,-.7,-1.4]:box((1.4,3,z),(.12,.85,.25),'black',.04)
box((0,4,-5.8),(.45,.5,.6),'gold',.1);finish('pistol-geometry',metal)
grip();box((0,2,-3.1),(3.1,3.7,11.2),'steel',.5)
cylinder((0,2.4,-10),.85,4,'black','z');cylinder((0,2.4,-12.1),1.1,1.2,'lightsteel','z')
box((0,-.15,-5.2),(2,5.8,2.9),'black',.4);box((0,-3.05,-5.2),(2.3,.8,3.4),'gold',.2)
box((0,2.3,4.3),(2.6,2.5,4.4),'darkcoat',.45);box((0,1.5,6.4),(2.7,4.2,1.3),'leather',.3)
box((0,4.2,-2.3),(2.1,.6,7),'lightsteel',.1);box((0,5,-1.4),(2.2,1.3,2.8),'black',.2)
box((0,5,-2.85),(1.3,.7,.2),0x74CFBF,.05)
for z in [-4,-5.3,-6.6]:box((1.6,2.5,z),(.2,1.3,.6),'black',.12)
finish('smg-geometry',metal)
grip();box((0,1.7,-2.1),(3.4,3.8,7.8),'steel',.45)
cylinder((0,2.7,-10),1.05,12,'black','z');cylinder((0,.8,-9.5),.8,10,'lightsteel','z')
box((0,.3,-6.7),(3.2,3,5),'leather',.6)
for z in [-5,-6,-7,-8]:box((0,.3,z),(3.35,2.7,.24),'gold',.06)
box((0,1.7,4.9),(2.7,2.5,6.2),'leather',.5);box((0,.5,7.6),(3,4.5,1.4),'darkcoat',.3)
box((0,4,-14.4),(.5,.6,.7),'gold',.1);cylinder((0,2.7,-16.3),1.3,.8,'lightsteel','z');cylinder((0,2.7,-16.75),.86,.12,'black','z')
finish('shotgun-geometry',metal)
box((0,.3,0),(1.9,4.3,1.9),'leather',.4);box((0,2.7,0),(3.5,.8,2.2),'gold',.2)
# Tapered six-sided blade with real edge bevel, not a rectangular voxel sword.
verts=[(-.55,1.9,-1),(.55,1.9,-1),(-.5,3.4,-1),(.5,3.4,-1),(-.32,2.4,-8.1),(.32,2.4,-8.1),(0,3.05,-10)]
verts=[position(v) for v in verts]
mesh=bpy.data.meshes.new('Forged taper');mesh.from_pydata(verts,[],[(0,1,3,2),(0,4,5,1),(2,3,6),(0,2,6,4),(1,5,6,3),(4,6,5)])
o=bpy.data.objects.new('Blade',mesh);bpy.context.collection.objects.link(o);colorize(o,'lightsteel');finish('knife-geometry',metal)

bpy.ops.wm.save_as_mainfile(filepath=str(Path(__file__).with_name('hunter-kit.blend')))
bpy.ops.export_scene.gltf(filepath=str(OUT/'hunter-kit.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_materials='EXPORT',export_attributes=True)
print('HIDEAWAY hunter kit exported:',OUT/'hunter-kit.glb')
