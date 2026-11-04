import json,collections
caja=(-58.405,-34.60,-58.375,-34.578)  # Recoleta y alrededores
def pto(g):
    c=g.get('coordinates')
    while isinstance(c,list) and c and isinstance(c[0],list): c=c[0]
    return c
def dentro(g):
    c=pto(g)
    return c and caja[0]<=c[0]<=caja[2] and caja[1]<=c[1]<=caja[3]
for n,cl in (('crudo/ov_edif.jsonl',('height','num_floors','roof_shape','roof_color','facade_color','facade_material','roof_material','class','min_height','names')),('crudo/osm_edif.jsonl',('height','building:levels','roof:shape','roof:levels','building:colour','building:material','roof:colour','start_date','name','architect','heritage','building:part'))):
    t=z=0;a=collections.Counter();b=collections.Counter();fu=collections.Counter()
    for l in open(n):
        f=json.loads(l.strip('\x1e\n '));t+=1
        if not dentro(f['geometry']):continue
        z+=1;p=f['properties']
        for k in cl:
            if p.get(k) not in (None,''):a[k]+=1
        s=p.get('sources')
        if isinstance(s,str):
            try:s=json.loads(s)
            except Exception:s=[]
        for q in (s or []):
            if isinstance(q,dict):fu[q.get('dataset')]+=1
        b[str(p.get('building') or p.get('subtype'))]+=1
    print(n,'total',t,'zona',z,dict(a));print(' tipos',b.most_common(10),' fuentes',fu.most_common(5))
t=z=0;a=collections.Counter();c=collections.Counter()
for l in open('crudo/ov_lug.jsonl'):
    f=json.loads(l.strip('\x1e\n '));t+=1
    if not dentro(f['geometry']):continue
    z+=1;p=f['properties']
    for k in ('websites','socials','phones','emails','brand','addresses'):
        if p.get(k):a[k]+=1
    x=p.get('categories')
    if isinstance(x,str):
        try:x=json.loads(x)
        except Exception:x={}
    c[(x or {}).get('primary')]+=1
print('lugares',t,'zona',z,dict(a));print(c.most_common(25))
t=collections.Counter();k=collections.Counter()
for l in open('crudo/osm_cosas.jsonl'):
    f=json.loads(l.strip('\x1e\n '));p=f['properties']
    if not dentro(f['geometry']):continue
    for q in ('entrance','door','shop','amenity','tourism','natural','highway','man_made','barrier'):
        if q in p:t[q+'='+str(p[q])]+=1
    for q in ('phone','contact:phone','website','contact:website','contact:whatsapp','contact:instagram','opening_hours','wheelchair','addr:housenumber'):
        if q in p:k[q]+=1
print(t.most_common(50));print(k.most_common())
