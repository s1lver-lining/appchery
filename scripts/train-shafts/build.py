import os
from strip import *
from agree import pseudo_lines
import pickle, collections, sys
rng=np.random.default_rng(0)
data=[]
for fi,f in enumerate(IDX):
    img=load(f); L=luma(img); lines,R=find_lines(f,img,maxlines=60)
    tips=[(a['x'],a['y']) for a in f['arrows']]+[to_px(f,h['x'],h['y']) for h in f['hidden']] if f['hidden'] and isinstance(f['hidden'][0],dict) else [(a['x'],a['y']) for a in f['arrows']]
    nocked=set()
    for s in f['shafts']:
        for i,a in enumerate(f['arrows']):
            if abs(s['tip']['fx']-a['fx'])<1e-9 and abs(s['tip']['fy']-a['fy'])<1e-9: nocked.add(i)
    P={i:v for i,v in pseudo_lines(f,img,lines,R,2).items() if i not in nocked}
    items=[]
    def add(px0,py0,ux,uy,tip,kind):
        feat,t=strip(f,img,L,px0,py0,ux,uy,R)
        if tip is None: tgt=K
        else:
            s=(tip[0]-px0)*ux+(tip[1]-py0)*uy
            tgt=int(round(s/(2*HALF*R/(K-1))+(K-1)/2))
            if not 0<=tgt<K: return
        items.append((feat,tgt,kind))
    plines={id(l):i for i,(l,p) in P.items()}
    for l in lines:
        p0=line_through(f,l['ax'],l['ay'],l['ux'],l['uy'])
        m=[s for s in f['shafts'] if matches(l,s,R)]
        if m: add(*p0,l['ux'],l['uy'],(m[0]['tip']['x'],m[0]['tip']['y']),'cand+'); continue
        if id(l) in plines:
            a=f['arrows'][plines[id(l)]]; add(*p0,l['ux'],l['uy'],(a['x'],a['y']),'pseudo+'); continue
        near=any(abs((x-l['ax'])*l['uy']-(y-l['ay'])*l['ux'])<0.04*R for x,y in tips)
        if not near: add(*p0,l['ux'],l['uy'],None,'cand-')
    for s in f['shafts']:
        tx,ty=s['tip']['x'],s['tip']['y']; nx,ny=s['nock']['x'],s['nock']['y']
        a0=np.arctan2(ny-ty,nx-tx)
        for k in range(4):
            a=a0+np.radians(rng.normal(0,1.2)); off=rng.normal(0,0.008)*R
            ux,uy=np.cos(a),np.sin(a); add(*line_through(f,tx-uy*off,ty+ux*off,ux,uy),ux,uy,(tx,ty),'true')
    for i,(l,p) in P.items():
        a=f['arrows'][i]
        for k in range(2):
            ang=np.arctan2(l['uy'],l['ux'])+np.radians(rng.normal(0,1.2)); off=rng.normal(0,0.008)*R
            ux,uy=np.cos(ang),np.sin(ang); add(*line_through(f,a['x']-uy*off,a['y']+ux*off,ux,uy),ux,uy,(a['x'],a['y']),'pseudo')
    data.append(dict(fi=fi,s=f['video'][9:13],video=f['video'],items=items))
pickle.dump(data,open(os.environ.get('OUTPKL','strips2.pkl'),'wb'))
c=collections.Counter(k for d in data for _,_,k in d['items']); print(c)
print(collections.Counter(d['s'] for d in data))
