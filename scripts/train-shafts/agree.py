from pseudo import *
def pseudo_lines(f,img,lines,R,tol=4,perp=0.015):
    """For each labelled arrow: a finder line through its tip agreeing with a classical run. Returns {arrow index: line}."""
    d=byk.get((f['video'][-24:],f['index']))
    if not d: return {}
    runs=runs_of(d); out={}
    for i,a in enumerate(f['arrows']):
        p=pseudo((a['fx'],a['fy']),runs)
        if not p: continue
        cdir=np.arctan2(p[2]-a['fy'],p[1]-a['fx'])
        best=None
        for l in lines:
            # perpendicular distance from the tip, in face radii
            dx,dy=a['x']-l['ax'],a['y']-l['ay']
            if abs(dx*l['uy']-dy*l['ux'])>perp*R: continue
            # direction in face coords from tip along the line, both ways
            fx2,fy2=to_face(f,a['x']+l['ux']*10,a['y']+l['uy']*10)
            ld=np.arctan2(fy2-a['fy'],fx2-a['fx'])
            err=min(abs(np.angle(np.exp(1j*(ld-cdir)))),abs(np.angle(np.exp(1j*(ld+np.pi-cdir)))))
            if np.degrees(err)<=tol and (best is None or err<best[0]): best=(err,l)
        if best: out[i]=(best[1],p)
    return out
