import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_ORDER, fitWithin, formatSize, methodFor, relinkMedia, savedPercent, smallName, videoSize, withJpegType } from './compress';

describe('file compression rules', () => {
  it('knows how each kind of file gets smaller', () => {
    expect(methodFor('Photo.JPG')).toBe('image');
    expect(methodFor('scan.heic')).toBe('image');
    expect(methodFor('report.pdf')).toBe('pdf');
    expect(methodFor('essay.docx')).toBe('office');
    expect(methodFor('slides.pptx')).toBe('office');
    expect(methodFor('marks.xlsx')).toBe('office');
    expect(methodFor('lecture.mov')).toBe('video');
    expect(methodFor('voice.wav')).toBe('audio');
    expect(methodFor('notes.txt')).toBe('zip');
    expect(methodFor('data.csv')).toBe('zip');
    expect(methodFor('archive.zip')).toBe('none');
    expect(methodFor('funny.gif')).toBe('none');
    expect(methodFor('blob', 'image/png')).toBe('image');
    expect(methodFor('blob', 'video/mp4')).toBe('video');
  });

  it('levels go from gentle to strong', () => {
    const [l, m, s] = LEVEL_ORDER.map((k) => LEVELS[k]);
    expect(l.maxSide > m.maxSide && m.maxSide > s.maxSide).toBe(true);
    expect(l.quality > m.quality && m.quality > s.quality).toBe(true);
    expect(l.videoBitrate > m.videoBitrate && m.videoBitrate > s.videoBitrate).toBe(true);
  });

  it('shrinks pictures and videos without ever making them bigger', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ w: 2000, h: 1500 });
    expect(fitWithin(800, 600, 2000)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(1000, 5000, 1280)).toEqual({ w: 256, h: 1280 });
    expect(videoSize(1920, 1080, 720)).toEqual({ height: 720 });
    expect(videoSize(1080, 1920, 720)).toEqual({ width: 720 });
    expect(videoSize(1280, 720, 720)).toBeNull();
    expect(videoSize(1920, 1080, 481)).toEqual({ height: 482 });
  });

  it('names and sizes', () => {
    expect(smallName('Holiday photo.png', 'jpg')).toBe('Holiday photo-small.jpg');
    expect(smallName('report.pdf')).toBe('report-small.pdf');
    expect(smallName('a:b.docx')).toBe('a-b-small.docx');
    expect(smallName('README')).toBe('README-small');
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatSize(25 * 1024 * 1024)).toBe('25 MB');
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(1000, 1200)).toBe(0);
  });

  it('points an Office file at a picture that became a JPEG', () => {
    const rels = '<Relationship Id="r1" Target="media/image1.png"/><Relationship Id="r2" Target="../media/image1.png"/><Relationship Id="r3" Target="/word/media/image1.png"/><Relationship Id="r4" Target="media/image11.png"/>';
    expect(relinkMedia(rels, 'image1.png', 'image1.jpg')).toBe('<Relationship Id="r1" Target="media/image1.jpg"/><Relationship Id="r2" Target="../media/image1.jpg"/><Relationship Id="r3" Target="/word/media/image1.jpg"/><Relationship Id="r4" Target="media/image11.png"/>');
    expect(withJpegType('<Types><Default Extension="png" ContentType="image/png"/></Types>')).toBe('<Types><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/></Types>');
    expect(withJpegType('<Types><Default Extension="JPG" ContentType="image/jpeg"/></Types>')).toBe('<Types><Default Extension="JPG" ContentType="image/jpeg"/></Types>');
  });
});
