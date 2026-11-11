import sys, struct, numpy as np
from PIL import Image, ImageDraw
def load(fn):
    d=open(fn,'rb').read(); n=struct.unpack('<I',d[80:84])[0]
    a=np.frombuffer(d[84:84+50*n],dtype=np.dtype([('n','<f4',3),('v','<f4',(3,3)),('a','<u2')]))
    return a['v'].astype(np.float64)
def rot(el,az):
    el,az=np.radians(el),np.radians(az)
    Rz=np.array([[np.cos(az),-np.sin(az),0],[np.sin(az),np.cos(az),0],[0,0,1]])
    Rx=np.array([[1,0,0],[0,np.cos(el),-np.sin(el)],[0,np.sin(el),np.cos(el)]])
    return Rx@Rz
def render(V, el, az, S=520):
    R=rot(-90+el,az)  # camera looking along -z after rotation
    P=V.reshape(-1,3)@R.T; P=P.reshape(-1,3,3)
    mn=P.reshape(-1,3).min(0); mx=P.reshape(-1,3).max(0)
    sc=(S-20)/max(mx[0]-mn[0],mx[1]-mn[1])
    X=(P[...,0]-mn[0])*sc+10; Y=S-((P[...,1]-mn[1])*sc+10); Z=P[...,2]
    n=np.cross(P[:,1]-P[:,0],P[:,2]-P[:,0]); n/= (np.linalg.norm(n,axis=1,keepdims=True)+1e-12)
    L=np.array([0.3,0.5,0.8]); L/=np.linalg.norm(L)
    sh=np.clip(n@L,0,1)*0.7+0.3
    zb=np.full((S,S),-1e9); img=np.ones((S,S,3))*0.97
    for t in range(len(P)):
        xs,ys,zs=X[t],Y[t],Z[t]
        x0,x1=int(max(0,np.floor(xs.min()))),int(min(S-1,np.ceil(xs.max())))
        y0,y1=int(max(0,np.floor(ys.min()))),int(min(S-1,np.ceil(ys.max())))
        if x1<x0 or y1<y0: continue
        gx,gy=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
        d=(ys[1]-ys[2])*(xs[0]-xs[2])+(xs[2]-xs[1])*(ys[0]-ys[2])
        if abs(d)<1e-12: continue
        a=((ys[1]-ys[2])*(gx-xs[2])+(xs[2]-xs[1])*(gy-ys[2]))/d
        b=((ys[2]-ys[0])*(gx-xs[2])+(xs[0]-xs[2])*(gy-ys[2]))/d
        c=1-a-b
        m=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6)
        if not m.any(): continue
        z=a*zs[0]+b*zs[1]+c*zs[2]
        sub=zb[y0:y1+1,x0:x1+1]
        w=m&(z>sub)
        sub[w]=z[w]
        col=np.array([0.35,0.55,0.85])*sh[t] if n[t,2]>0 else np.array([0.85,0.35,0.3])*sh[t]
        img[y0:y1+1,x0:x1+1][w]=col
    return (img*255).astype(np.uint8)
fn=sys.argv[1]; out=sys.argv[2]
V=load(fn)
views=[(30,-35),(30,145),(70,-90)] if len(sys.argv)<4 else eval(sys.argv[3])
ims=[render(V,e,a) for e,a in views]
Image.fromarray(np.concatenate(ims,1)).save(out)
