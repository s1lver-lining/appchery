import json, numpy as np
from scipy.ndimage import map_coordinates
import os
S=os.environ.get('SHAFTS_WORK','/tmp/appchery-shafts')
IDX=json.load(open(S+'/frames/index.json'))
def load(f):
    a=np.fromfile(S+'/frames/'+f['file'],dtype=np.uint8).reshape(f['height'],f['width'],4)[...,:3].astype(np.float32)
    return a
def luma(a): return 0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2]
def hv(a): return a.max(-1)
def H(f): return np.array(f['hand'])
def to_px(f,x,y):
    h=H(f); w=h[2,0]*x+h[2,1]*y+h[2,2]
    X=(h[0,0]*x+h[0,1]*y+h[0,2])/w; Y=(h[1,0]*x+h[1,1]*y+h[1,2])/w
    return (X-f['box']['x'])/f['scale'], (Y-f['box']['y'])/f['scale']
def to_face(f,X,Y):
    h=np.linalg.inv(H(f)); X=np.asarray(X)*f['scale']+f['box']['x']; Y=np.asarray(Y)*f['scale']+f['box']['y']
    w=h[2,0]*X+h[2,1]*Y+h[2,2]
    return (h[0,0]*X+h[0,1]*Y+h[0,2])/w,(h[1,0]*X+h[1,1]*Y+h[1,2])/w
def rad_px(f):
    # mean pixel radius of the face (unit circle)
    t=np.linspace(0,2*np.pi,64,endpoint=False); X,Y=to_px(f,np.cos(t),np.sin(t))
    cx,cy=to_px(f,0,0); return float(np.mean(np.hypot(X-cx,Y-cy)))
def samp(img,X,Y): return map_coordinates(img,[np.asarray(Y),np.asarray(X)],order=1,mode='nearest')
def month(v):
    import re; m=re.search(r'2026(\d\d)(\d\d)',v); return m.group(1) if m else '??'
