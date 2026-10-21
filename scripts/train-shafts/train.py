import os, json, pickle, numpy as np, torch, torch.nn as nn
DEV='cuda' if torch.cuda.is_available() else 'cpu'
torch.set_num_threads(3); torch.manual_seed(int(os.environ.get('SEED','0')))
from strip import K, HALF, ACROSS
DAYS={'0818':['3010','e344'],'0829':['c51c','d749'],'0902':['3256','7db1'],'0905':['3acc','f3a8','ffff'],'1019':['226f','27f9','7f6e','96ae']}
data=pickle.load(open(os.environ.get('DATA','strips2.pkl'),'rb'))
C=data[0]['items'][0][0].shape[0]; W=int(os.environ.get('W','16')); EP=int(os.environ.get('EP','40'))
class Net(nn.Module):
    def __init__(s):
        super().__init__(); L=[]; c=C
        for d in (1,2,4,8,16): L+=[nn.Conv1d(c,W,5,padding=2*d,dilation=d),nn.ReLU()]; c=W
        s.body=nn.Sequential(*L); s.tip=nn.Conv1d(W,1,1); s.none=nn.Linear(W,1)
    def forward(s,x):
        h=s.body(x); return torch.cat([s.tip(h)[:,0],s.none(h.max(-1).values)],1)
def tensors(items,aug=False):
    X=np.stack([i[0] for i in items]); y=np.array([i[1] for i in items])
    if aug: X=np.concatenate([X,X[:,:,::-1]]); y=np.concatenate([y,np.where(y==K,K,K-1-y)])
    return torch.tensor(X.copy()),torch.tensor(y)
def export(net,path):
    layers=[dict(inputs=m.in_channels,outputs=m.out_channels,kernel=m.kernel_size[0],dilation=m.dilation[0],weight=[round(v,6) for v in m.weight.detach().flatten().tolist()],bias=[round(v,6) for v in m.bias.detach().tolist()]) for m in net.body if isinstance(m,nn.Conv1d)]
    json.dump(dict(positions=K,half=HALF,across=ACROSS,spacing=1.5,layers=layers,tip=dict(weight=net.tip.weight.detach().flatten().tolist(),bias=net.tip.bias.item()),none=dict(weight=net.none.weight.detach().flatten().tolist(),bias=net.none.bias.item()),threshold=0.5),open(path,'w'))
hold=os.environ.get('HOLD','')
held=DAYS.get(hold,[])
tr=[i for d in data if d['s'] not in held for i in d['items']]
net=Net().to(DEV); opt=torch.optim.Adam(net.parameters(),2e-3,weight_decay=1e-4); X,y=tensors(tr,True); X,y=X.to(DEV),y.to(DEV)
for ep in range(EP):
    perm=torch.randperm(len(y),device=DEV)
    for b in range(0,len(y),256):
        i=perm[b:b+256]; opt.zero_grad(); nn.functional.cross_entropy(net(X[i]),y[i]).backward(); opt.step()
tag=os.environ.get('TAG','m')
net=net.cpu()
export(net,f'{tag}-{hold or "all"}.json')
if held:
    te=[i for d in data if d['s'] in held for i in d['items'] if i[2] in ('cand+','pseudo+','cand-')]
    Xt,yt=tensors(te)
    with torch.no_grad(): p=torch.softmax(net(Xt),1).numpy()
    step=2*HALF/(K-1)
    for kind in ('cand+','pseudo+'):
        idx=[j for j,i in enumerate(te) if i[2]==kind]
        if not idx: continue
        keep=np.array([1-p[j,K]>0.5 for j in idx]); err=np.array([abs(np.argmax(p[j,:K])-yt[j].item())*step for j in idx])
        print(hold,kind,len(idx),'kept',keep.mean().round(2),'tip<0.05',(keep&(err<0.05)).mean().round(2))
    idx=[j for j,i in enumerate(te) if i[2]=='cand-']
    print(hold,'false kept',np.mean([1-p[j,K]>0.5 for j in idx]).round(3),len(idx))
