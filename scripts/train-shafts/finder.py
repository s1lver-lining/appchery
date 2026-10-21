from common import *
from scipy.ndimage import gaussian_filter
def hessian_ridge(L,sig):
    g=gaussian_filter(L,sig)
    gy,gx=np.gradient(g); hyy,hyx=np.gradient(gy); hxy,hxx=np.gradient(gx)
    hxy=(hxy+hyx)/2
    tr=hxx+hyy; dt=np.sqrt(((hxx-hyy)/2)**2+hxy**2)
    l1=tr/2+dt; l2=tr/2-dt  # l1>=l2
    big=np.where(np.abs(l1)>np.abs(l2),l1,l2); small=np.where(np.abs(l1)>np.abs(l2),l2,l1)
    strength=(np.abs(big)-np.abs(small))*sig**2
    # normal direction (eigvec of big): angle of normal
    nang=0.5*np.arctan2(2*hxy,hxx-hyy)  # direction of l1 eigvec
    nang=np.where(np.abs(l1)>np.abs(l2),nang,nang+np.pi/2)
    lineang=nang+np.pi/2
    return strength,np.mod(lineang,np.pi)
def either(L,X,Y,px,py,th=8):
    offs=np.arange(-1.5,1.6,0.5)
    cs=np.stack([samp(L,X+px*o,Y+py*o) for o in offs])
    lf=np.stack([samp(L,X-px*k,Y-py*k) for k in (3,4,5)]); rf=np.stack([samp(L,X+px*k,Y+py*k) for k in (3,4,5)])
    dark=np.minimum(lf.max(0)-cs.min(0), rf.max(0)-cs.min(0)); light=np.minimum(cs.max(0)-lf.min(0), cs.max(0)-rf.min(0))
    return np.maximum(dark,light)
NA=360
def find_lines(f,img,sig=1.2,top=0.06,maxlines=40,inner=1.1,bridge=0.06,minlen=0.12,th=8,outer=3.0,climb=0.2,vote_r=1.3):
    L=luma(img); h,w=L.shape
    st,ang=hessian_ridge(L,sig)
    yy,xx=np.mgrid[0:h,0:w]; fx,fy=to_face(f,xx.ravel(),yy.ravel()); rr=np.hypot(fx,fy).reshape(h,w)
    R=rad_px(f)
    m=(rr<vote_r)
    thr=np.quantile(st[m],1-top); sel=m&(st>thr)
    ys,xs=np.nonzero(sel); wv=st[sel]; a=ang[sel]
    D=int(np.hypot(h,w))+1
    acc=np.zeros((NA,2*D+1))
    ai=np.round(a/np.pi*NA).astype(int)
    for da in (-2,-1,0,1,2):
        aa=(ai+da)%NA; th_=aa*np.pi/NA
        rho=np.round(xs*np.cos(th_+np.pi/2)+ys*np.sin(th_+np.pi/2)).astype(int)+D
        np.add.at(acc,(aa,rho),wv)
    from scipy.ndimage import maximum_filter
    pk=(acc==maximum_filter(acc,size=(9,7),mode='wrap'))&(acc>0)
    idx=np.argsort(acc[pk])[::-1][:maxlines*3]
    A,Rh=np.nonzero(pk); A=A[np.argsort(acc[pk])[::-1]][:maxlines*3]; Rh=Rh[np.argsort(acc[pk])[::-1]][:maxlines*3]
    out=[]
    cx,cy=to_px(f,0,0)
    for a_,r_ in zip(A,Rh):
        th_=a_*np.pi/NA; nx,ny=np.cos(th_+np.pi/2),np.sin(th_+np.pi/2); ux,uy=np.cos(th_),np.sin(th_)
        rho=r_-D
        # line passes the face within 1.0 r?
        x0,y0=nx*rho,ny*rho
        t0=(cx-x0)*ux+(cy-y0)*uy
        t=np.arange(t0-2.2*R,t0+2.2*R,1.0); X=x0+ux*t; Y=y0+uy*t
        ok=(X>5)&(Y>5)&(X<w-6)&(Y<h-6)
        fX,fY=to_face(f,X,Y); r=np.hypot(fX,fY)
        ok&=r<outer
        if ok.sum()<minlen*R: continue
        e=np.zeros_like(t); e[ok]=either(L,X[ok],Y[ok],nx,ny)
        hit=(e>th)&ok
        # longest run with gaps<=bridge*R
        best=None;start=None;last=None;gap=0
        for i in range(len(t)):
            if hit[i]:
                if start is None: start=i
                last=i;gap=0
            elif start is not None:
                gap+=1
                if gap>bridge*R:
                    if best is None or last-start>best[1]-best[0]: best=(start,last)
                    start=None
        if start is not None and (best is None or last-start>best[1]-best[0]): best=(start,last)
        if best is None or best[1]-best[0]<minlen*R: continue
        s0,s1=best; fill=hit[s0:s1+1].mean()
        if r[s0:s1+1].min()>1.05: continue
        rs=r[s0:s1+1]; cl=(rs.max()-rs.min())/max(1e-6,(s1-s0)/R)
        if cl<climb: continue
        out.append(dict(ax=X[s0],ay=Y[s0],bx=X[s1],by=Y[s1],ux=ux,uy=uy,len=(s1-s0)/R,fill=fill,votes=acc[a_,r_],str=np.median(e[s0:s1+1]),climb=cl,rin=rs.min()))
    # dedupe near-identical lines
    keep=[]
    for o in sorted(out,key=lambda o:-o['len']*o['fill']):
        dup=False
        for k in keep:
            if abs(o['ux']*k['uy']-o['uy']*k['ux'])<np.sin(np.radians(3)):
                mx,my=(o['ax']+o['bx'])/2-k['ax'],(o['ay']+o['by'])/2-k['ay']
                if abs(mx*k['uy']-my*k['ux'])<0.025*R: dup=True;break
        if not dup: keep.append(o)
    return keep[:maxlines],R
def matches(line,s,R,ang=5,off=0.03):
    tx,ty=s['tip']['x'],s['tip']['y']; nx,ny=s['nock']['x'],s['nock']['y']
    d=np.hypot(nx-tx,ny-ty); ux,uy=(nx-tx)/d,(ny-ty)/d
    if abs(line['ux']*uy-line['uy']*ux)>np.sin(np.radians(ang)): return False
    mx,my=(line['ax']+line['bx'])/2-tx,(line['ay']+line['by'])/2-ty
    return abs(mx*uy-my*ux)<off*R
