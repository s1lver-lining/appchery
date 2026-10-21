from finder import *
import os
K=int(os.environ.get("K","256")); HALF=float(os.environ.get("HALF","3.0")); ACROSS=4
def strip(f,img,L,px0,py0,ux,uy,R):
    """Strip along the line through (px0,py0) in direction u: K positions over +-HALF radii, 2*ACROSS+1 offsets of R/100."""
    t=(np.arange(K)-(K-1)/2)*(2*HALF*R/(K-1))
    w=R/100; nx,ny=-uy,ux
    X=px0+ux*t; Y=py0+uy*t
    h,wd=L.shape
    valid=((X>=0)&(Y>=0)&(X<=wd-1)&(Y<=h-1)).astype(np.float32)
    rows=[]
    for j in range(-ACROSS,ACROSS+1):
        rows.append(samp(L,X+nx*j*w*1.5,Y+ny*j*w*1.5))
    rows=np.stack(rows)/255.0
    bg=(rows[0]+rows[-1]+rows[1]+rows[-2])/4
    rel=rows-bg
    # colour of the centre against flanks
    cc=np.stack([samp(img[...,c],X,Y) for c in range(3)])/255.0
    cf=np.stack([(samp(img[...,c],X+nx*4*w*1.5,Y+ny*4*w*1.5)+samp(img[...,c],X-nx*4*w*1.5,Y-ny*4*w*1.5))/2 for c in range(3)])/255.0
    fX,fY=to_face(f,X,Y); r=np.hypot(fX,fY)
    feat=np.concatenate([rel,(cc-cf),bg[None],r[None]/3,valid[None]],0)
    feat[:, valid==0]=0; feat[-1]=valid
    return feat.astype(np.float32), t
def line_through(f,ax,ay,ux,uy):
    cx,cy=to_px(f,0,0); s=(cx-ax)*ux+(cy-ay)*uy
    return ax+ux*s, ay+uy*s
