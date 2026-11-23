"""Pixel comparisons of genuine same-environment browser captures.
Baseline differences are review evidence, not auto-approved design changes.
A candidate-repeat comparison rejects instability beyond documented one-level raster rounding.
"""
from __future__ import annotations
import argparse, csv, hashlib, html, json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat


def repeat_comparison(image: Image.Image, repeat: Image.Image):
    """Allow at most 16 pixels of one-level RGB raster rounding; never geometry drift."""
    if image.size != repeat.size:
        return {'identical':False, 'accepted':False, 'changedPixels':None, 'maxChannelDelta':None}
    diff=ImageChops.difference(image,repeat)
    channels=diff.split()
    maximum=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2])
    histogram=maximum.histogram()
    count=sum(histogram[1:]); delta=maximum.getextrema()[1]
    return {'identical':count==0, 'accepted':count<=16 and delta<=1, 'changedPixels':count, 'maxChannelDelta':delta}

def run(args):
    args.output.mkdir(parents=True,exist_ok=True)
    before={p.name:p for p in args.before.glob('*.png')}
    after={p.name:p for p in args.after.glob('*.png')}
    if not before or before.keys()!=after.keys():
        raise SystemExit('Missing or unmatched screenshot set; comparison is not accepted.')
    results=[]; nondeterministic=[]
    for name in sorted(before):
        with Image.open(before[name]) as image:a=image.convert('RGB')
        with Image.open(after[name]) as image:b=image.convert('RGB')
        width=max(a.width,b.width);height=max(a.height,b.height)
        ac=Image.new('RGB',(width,height),'white');bc=Image.new('RGB',(width,height),'white')
        ac.paste(a);bc.paste(b);diff=ImageChops.difference(ac,bc)
        changed=sum(count for value,count in enumerate(diff.convert('L').histogram()) if value)
        # An RGB-channel mask detects even one-channel differences with sub-gray magnitude.
        mask=ImageChops.lighter(ImageChops.lighter(*diff.split()[:2]),diff.split()[2]).point(lambda v:255 if v else 0)
        changed=mask.histogram()[255]
        repeat_result=None
        repeat_equal=None
        if args.repeat:
            path=args.repeat/name
            if not path.exists():raise SystemExit('Missing repeat screenshot: '+name)
            with Image.open(path) as image:repeat=image.convert('RGB')
            repeat_result=repeat_comparison(b,repeat)
            repeat_equal=repeat_result['identical']
            if not repeat_result['accepted']:nondeterministic.append(name)
        if args.diffs and changed:
            diff.save(args.output/('diff-'+name))
        results.append({'screenshot':name,'beforeSize':a.size,'afterSize':b.size,'changedPixels':changed,'changedFraction':round(changed/(width*height),6),'meanChannelDifference':round(sum(ImageStat.Stat(diff).mean)/3,4),'repeatIdentical':repeat_equal,'repeat':repeat_result,'beforeSha256':hashlib.sha256(before[name].read_bytes()).hexdigest(),'afterSha256':hashlib.sha256(after[name].read_bytes()).hexdigest()})
    (args.output/'results.json').write_text(json.dumps(results,indent=2))
    with (args.output/'results.csv').open('w',newline='') as out:
        writer=csv.DictWriter(out,fieldnames=results[0].keys());writer.writeheader();writer.writerows(results)
    summary={'comparisons':len(results),'changed':sum(r['changedPixels']>0 for r in results),'repeatExecuted':bool(args.repeat),'repeatMismatches':nondeterministic,'repeatExactMatches':sum(r['repeatIdentical'] is True for r in results),'rasterTolerance':'At most 16 pixels, at most 1 RGB level in each channel, unchanged dimensions; only applies to candidate repeat, never design approval.','visualApproval':'REQUIRES_REVIEW; no changed screenshot is silently promoted to a golden baseline','method':'Same-viewport RGB pixel comparison, dimensions preserved; white padding only for unequal page heights.'}
    (args.output/'summary.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps(summary),flush=True)
    if nondeterministic:raise SystemExit(1)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--before',type=Path,required=True);p.add_argument('--after',type=Path,required=True);p.add_argument('--repeat',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--diffs',action='store_true');run(p.parse_args())
