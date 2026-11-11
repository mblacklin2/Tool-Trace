import sys, struct, numpy as np
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
def load(fn):
    d=open(fn,'rb').read(); n=struct.unpack('<I',d[80:84])[0]
    a=np.frombuffer(d[84:84+50*n],dtype=np.dtype([('n','<f4',3),('v','<f4',(3,3)),('a','<u2')]))
    return a['v'].astype(np.float64)
def section(V, axis, c):
    segs=[]
    for t in V:
        d=t[:,axis]-c
        pts=[]
        for i in range(3):
            j=(i+1)%3
            if (d[i]<0)!=(d[j]<0):
                s=d[i]/(d[i]-d[j]); pts.append(t[i]+(t[j]-t[i])*s)
        if len(pts)==2: segs.append(pts)
    return np.array(segs)
fn,out=sys.argv[1],sys.argv[2]; specs=eval(sys.argv[3])
V=load(fn)
fig,axs=plt.subplots(1,len(specs),figsize=(6*len(specs),6))
if len(specs)==1: axs=[axs]
for ax,(axis,c,lim) in zip(axs,specs):
    S=section(V,axis,c); o=[k for k in range(3) if k!=axis]
    for s in S: ax.plot(s[:,o[0]],s[:,o[1]],'b-',lw=1)
    ax.set_aspect('equal'); ax.grid(True,lw=0.3); ax.set_title(f'{fn} section {"xyz"[axis]}={c}',fontsize=8)
    if lim: ax.set_xlim(lim[0],lim[1]); ax.set_ylim(lim[2],lim[3])
    ax.set_xlabel("xyz"[o[0]]); ax.set_ylabel("xyz"[o[1]])
plt.tight_layout(); plt.savefig(out,dpi=90)
