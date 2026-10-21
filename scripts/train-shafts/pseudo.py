from common import *
import collections
D=json.load(open(S+'/classical-dump.json'))
byk={(d['video'],d['index']):d for d in D}
def runs_of(d):
    r=[(p['x'],p['y'],p['far']['x'],p['far']['y']) for p in d['proposals'] if p.get('far')]
    r+=[(q['x'],q['y'],q['outX'],q['outY']) for q in d['rejected'] if 'outX' in q]
    return r
def pseudo(tip,runs,perp=0.02,near=0.12,minlen=0.15):
    best=None
    for ax,ay,bx,by in runs:
        L=np.hypot(bx-ax,by-ay)
        if L<minlen: continue
        ux,uy=(bx-ax)/L,(by-ay)/L
        dx,dy=tip[0]-ax,tip[1]-ay
        if abs(dx*uy-dy*ux)>perp: continue
        along=dx*ux+dy*uy
        if along<-near or along>near: continue
        if best is None or L>best[0]: best=(L,bx,by)
    return best
if __name__=='__main__':
    errs=[];cover=collections.Counter();tot=collections.Counter()
    for f in IDX:
        d=byk.get((f['video'][-24:],f['index']))
        if not d: continue
        R=runs_of(d)
        for a in f['arrows']:
            p=pseudo((a['fx'],a['fy']),R)
            s=f['video'][9:13]; tot[s]+=1
            if p: cover[s]+=1
        for s_ in f['shafts']:
            p=pseudo((s_['tip']['fx'],s_['tip']['fy']),R)
            if not p: continue
            nfx,nfy=to_face(f,s_['nock']['x'],s_['nock']['y'])
            a1=np.arctan2(nfy-s_['tip']['fy'],nfx-s_['tip']['fx']); a2=np.arctan2(p[2]-s_['tip']['fy'],p[1]-s_['tip']['fx'])
            errs.append(abs(np.degrees(np.angle(np.exp(1j*(a1-a2))))))
    e=np.array(errs); print('with nock',len(e),'median err deg',np.median(e).round(1),'within5',(e<5).mean().round(2),'within15',(e<15).mean().round(2))
    print({k:f'{cover[k]}/{tot[k]}' for k in sorted(tot)})
def agree(cands,tol=8):
    """cands: list of (tipx,tipy,farx,fary) in face coords; keep those leaning at the common meeting point."""
    if len(cands)<3: return [True]*len(cands)
    A=np.array([[c[0],c[1]] for c in cands]); U=np.array([[c[2]-c[0],c[3]-c[1]] for c in cands]); U/=np.linalg.norm(U,axis=1,keepdims=True)
    N=np.stack([-U[:,1],U[:,0]],1); w=np.ones(len(cands))
    def lean(E):
        T=E-A; r=np.linalg.norm(T,axis=1)+1e-9
        return np.degrees(np.arccos(np.clip(np.abs((U*T).sum(1))/r,0,1)))
    for _ in range(6):
        M=(N.T*w)@N; b=(N.T*w)@((N*A).sum(1))
        if abs(np.linalg.det(M))<1e-9: return [True]*len(cands)
        E=np.linalg.solve(M,b); w=1/(1+(lean(E)/tol)**2)
    return list(lean(E)<=tol)
