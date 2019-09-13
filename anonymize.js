// Output image resolution in pixels per inch.
var Resolution = 300;

// Determines how lenient the algorithm will be when finding anonymized text of
// similar dimensions to the original text. If the distance between the end of
// the anonymized token and the end of the original token exceeds
// GlyphReplacementTolerance*fontSize, the proposed replacement will be rejected.
var GlyphReplacementTolerance = 0.1;

// The following two parameters determine how frequently and by how much the
// GlyphReplacementTolerance is backed off. If the number of attempts to find a
// sequence of glyphs of correct dimensions exceeds BackOffFrequency*sequenceLength,
// the current value of GlyphReplacementTolerance is multiplied by BackOffAmount.
// Back off is only applied per token.
var BackOffFrequency = 10;
var BackOffAmount = 1.5;

// Determines when a sequence of glyphs should be split into multiple parts. If
// the distance between the previous glyph's advanced matrix and the current
// glyph's matrix is greater than MaxGlyphDistance*fontSize, then a split occurs.
// This parameter should rarely require tuning.
var MaxGlyphDistance = 0.1;

if (scriptArgs.length != 3) {
    print("usage: mutool run anonymize.js document.pdf pageNumber output.png")
    quit(1);
}

var scaleMatrix = Scale(Resolution/72, Resolution/72);

var doc = new Document(scriptArgs[0]);
var page = doc.loadPage(parseInt(scriptArgs[1])-1);
var pixmap = page.toPixmap(scaleMatrix, DeviceRGB);
pixmap.clear(255);

// Whitelists

function loadAnnotations(width, height) {
    try {
        var annotations = read(scriptArgs[0].replace(".pdf", ".json"));
    } catch (err) {
        return [];
    }
    annotations = JSON.parse(annotations);
    for (var i = 0; i < annotations.length; ++i) {
        annotations[i].x1 *= width;
        annotations[i].y1 *= height;
        annotations[i].x2 *= width;
        annotations[i].y2 *= height;
    }
    return annotations;
}

var ZoneWhitelist = loadAnnotations(pixmap.getWidth(), pixmap.getHeight());

function glyphInZoneWhitelist(glyph, ctm) {
    var currM = Concat(glyph.matrix, ctm);
    var nextM = Concat(glyph.nextMatrix, ctm);
    var points = getVertices(currM, nextM, ctm);
    var avgX = 0, avgY = 0;
    for (var i = 0; i < points.length; ++i) {
        avgX += points[i][0] / points.length;
        avgY += points[i][1] / points.length;
    }
    points.push([avgX, avgY]);
    for (var i = 0; i < ZoneWhitelist.length; ++i) {
        var zone = ZoneWhitelist[i];
        for (var j = 0; j < points.length; ++j) {
            var x0 = points[j][0];
            var y0 = points[j][1];
            if (x0 >= zone.x1 && x0 <= zone.x2 && y0 >= zone.y1 && y0 <= zone.y2) {
                return true;
            }
        }
    }
    return false;
}

var CharWhitelist = " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
function glyphInCharWhitelist(glyph) {
    return CharWhitelist.indexOf(String.fromCharCode(glyph.unicode)) >= 0;
}

// Font/character substitutions

var CharacterMap = {};
var analyzeCharacters = {
    showGlyph: function (f, m, g, u, v, b) {
        var fn = f.getName();
        if (!(fn in CharacterMap)) {
            CharacterMap[fn] = {};
        }
        CharacterMap[fn][u] = g;
    }
};
page.run({
    fillText: function(text, ctm, colorSpace, color, alpha) { text.walk(analyzeCharacters); },
    clipText: function(text, ctm) { text.walk(analyzeCharacters); },
    strokeText: function(text, stroke, ctm, colorSpace, color, alpha) { text.walk(analyzeCharacters); },
    clipStrokeText: function(text, stroke, ctm) { text.walk(analyzeCharacters); },
    ignoreText: function(text, ctm) { text.walk(analyzeCharacters); }
}, Identity);


var SubstitutionGroups = {
    lower: "abcdefghijklmnopqrstuvwxyzabcdefghiklmnopqrstuvwxyabcdefghiklmnopqrstuvwxyabcdefghiklmnoprstuvwxyabcdefghiklmnoprstuvwxyabcdefghiklmnoprstuvwxyabcdefghiklmnoprstuvwxyabcdefghiklmnoprstuvwxyabcdefghiklmnoprstuvwxyabcdefghiklmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuvwyabcdefghilmnoprstuyacdefghilmnoprstuyacdefghilmnoprstuyacdefghilmnoprstuyacdeghilmnoprstuyacdehilmnoprstuyacdehilmnoprstuyacdehilmnoprstuyacdehilmnoprstuyacdehilmnoprstuyacdehilmnoprstuyacdehilmnoprstuyacdehilmnoprstuyacdehilmnorstuyacdehilmnorstuacdehilmnorstuacdeilmnorstuacdeilmnorstuacdeilmnorstuacdeilmnorstuacdeilmnorstuacdeilmnorstuacdeilmnorstuacdeilmnorstuacdeilmnorstuacdeilnorstuacdeilnorstuacdeilnorstuacdeilnorstuacdeilnorstuacdeilnorstuacdeilnorstuacdeilnorstuacdeilnorstuacdeilnorstuaceilnorstuaceilnorstuaceilnorstuaceilnorstuaceilnorstuaceilnorstuaceilnorstuaceilnorstaceilnorstaceilnorstaceilnorstaceilnorstaeilnorstaeilnorstaeilnorstaeilnorstaeilnorstaeinorstaeinorstaeinorstaeinorstaeinorstaeinorstaeinorstaeinorstaeinorstaeinorstaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaeinortaenotaenotaenotaenotaenotaeotaeotaeotaeotaeotaeotaeotaeotaeotaeotaeotaeotaeotaeotaeotaeteteeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYABCDEFGHIJKLMNOPRSTUVWXYABCDEFGHILMNOPRSTUVWYABCDEFGHILMNOPRSTUVWYABCDEFGHILMNOPRSTUVWYABCDEFGHILMNOPRSTUWABCDEFGHILMNOPRSTUABCDEGILMNOPRSTUABCDEGILMNOPRSTUABCDEGILMNOPRSTUABCDEILMNOPRSTABCDEILMNOPRSTABCDEILNOPRSTACDEILNOPRSTACDEILNOPRSTACDEILNOPRSTACDEILNOPRSTACDEINOPRSTACDEINOPRSTACEINOPRSTACEINORSTACEINOSTAEINSTAEINSTAEINSTAESTAESTAESTAETAETATATATAT",
    digit: "012345678901200",
};

var FontSubstitutionGroups = {};
for (var fontName in CharacterMap) {
    FontSubstitutionGroups[fontName] = {};
    for (var group in SubstitutionGroups) {
        FontSubstitutionGroups[fontName][group] = "";
        var characters = SubstitutionGroups[group];
        for (var i = 0; i < characters.length; ++i) {
            var chr = characters[i];
            var uni = chr.charCodeAt(0);
            if (uni in CharacterMap[fontName]) {
                FontSubstitutionGroups[fontName][group] += chr;
            }
        }
    }
}

function unique(characters) {
    var uniqueCharacters = "";
    for (var i = 0; i < characters.length; ++i) {
        if (uniqueCharacters.indexOf(characters[i]) < 0) {
            uniqueCharacters += characters[i];
        }
    }
    return uniqueCharacters;
}

var FontSubstitutionGroupScores = {};
for (var fontName in CharacterMap) {
    FontSubstitutionGroupScores[fontName] = {}
    for (var group in FontSubstitutionGroups[fontName]) {
        var fontCharacters = unique(FontSubstitutionGroups[fontName][group]);
        var characters = unique(SubstitutionGroups[group]);
        FontSubstitutionGroupScores[fontName][group] = fontCharacters.length / characters.length;
    }
}

function anonymizingPoolScore(fontName, unicode) {
    for (var group in FontSubstitutionGroups[fontName]) {
        var characters = FontSubstitutionGroups[fontName][group];
        if (characters.indexOf(String.fromCharCode(unicode)) >= 0) {
            return FontSubstitutionGroupScores[fontName][group];
        }
    }
    return 0;
}

function anonymizeUnicode(fontName, unicode) {
    for (var group in FontSubstitutionGroups[fontName]) {
        var characters = FontSubstitutionGroups[fontName][group];
        if (characters.indexOf(String.fromCharCode(unicode)) >= 0) {
            return characters[parseInt(Math.random()*characters.length)].charCodeAt(0);
        }
    }
    return unicode;
}

// Matrices/geometry

function advanceMatrix(m, font, glyph, wmode) {
    var adv = font.advanceGlyph(glyph, wmode);
    var tx = 0, ty = 0;
    if (wmode == 0) {
        tx = adv;
    } else {
        ty = -adv;
    }
    var m = m.slice();
    m[4] += tx * m[0] + ty * m[2];
    m[5] += tx * m[1] + ty * m[3];
    return m;
}

function distance(m1, m2) {
    var dx = m2[4] - m1[4];
    var dy = m2[5] - m1[5];
    return Math.sqrt(dx*dx + dy*dy);
}

function matricesDiffer(m1, m2) {
    for (var i = 0; i < 4; ++i) {
        if (m1[i] != m2[i]) {
            return true;
        }
    }
    if (distance(m1, m2) > MaxGlyphDistance * Math.abs(m1[0])) {
        return true;
    }
    return false;
}

function getVertices(m, am, ctm) {
    m = Concat(m, ctm);
    am = Concat(am, ctm);
    var vertices = [];
    vertices.push([m[4], m[5]]);
    vertices.push([m[4] + m[1], m[5] - m[0]]);
    vertices.push([am[4] + am[1], am[5] - am[0]]);
    vertices.push([am[4], am[5]]);
    return vertices;
}

// Text manipulation

function splitText(text) {
    var glyphs = []
    text.walk({
        showGlyph: function (f, m, g, u, v) {
            glyphs.push({
                "font": f, 
                "matrix": m,
                "nextMatrix": advanceMatrix(m, f, g, v),
                "glyph": g,
                "unicode": u,
                "wmode": v
            });
        }
    });
    var chunks = [];
    var chunk = [];
    for (var i = 0; i < glyphs.length; ++i) {
        var curr = glyphs[i];
        if (chunk.length > 0) {
            var last = chunk[chunk.length-1];
            if (String.fromCharCode(last.unicode) == " " || curr.font != last.font || curr.wmode != last.wmode || matricesDiffer(curr.matrix, last.nextMatrix)) {
                chunks.push(chunk);
                chunk = [];
            }
        }
        chunk.push(curr);
    }
    if (chunk.length > 0) {
        chunks.push(chunk);
    }
    for (var i = 0; i < chunks.length; ++i) {
        var characters = "";
        for (var j = 0; j < chunks[i].length; ++j) {
            characters += String.fromCharCode(chunks[i][j].unicode);
        }
    }
    return chunks;
}

var Replacements = {};

function generateText(glyphs, ctm) {
    var text = new Text();
    var f = glyphs[0].font;
    var m = glyphs[0].matrix;
    var v = glyphs[0].wmode;
    var replacements = {};
    var string = "";
    for (var i = 0; i < glyphs.length; ++i) {
        var u, g, color;
        var substitutionKey = glyphs[i].font.getName() + "-" + Concat(glyphs[i].matrix, ctm) + "-" + glyphs[i].unicode + "-" + glyphs[i].glyph + "-" + glyphs[i].wmode;
        if (substitutionKey in Replacements) {
            u = Replacements[substitutionKey].unicode;
            g = Replacements[substitutionKey].glyph;
            color = [1, 1, 0];
        } else if (glyphInZoneWhitelist(glyphs[i], ctm)) {
            u = glyphs[i].unicode;
            g = glyphs[i].glyph;
            color = [0, 0, 1];
        } else if (glyphInCharWhitelist(glyphs[i])) {
            u = glyphs[i].unicode;
            g = glyphs[i].glyph;
            color = [0, 1, 0];
        } else {
            u = anonymizeUnicode(f.getName(), glyphs[i].unicode);
            g = CharacterMap[f.getName()][u];
            if (anonymizingPoolScore(f.getName(), u) < 0.25) {
                color = [1, 0, 0];
            } else if (u == glyphs[i].unicode) {
                color = [0, 1, 1];
            } else {
                color = [0, 1, 0];
            }
        }
        replacements[substitutionKey] = {"color": color, "vertices": getVertices(m, advanceMatrix(m, f, g, v), ctm), "unicode": u, "glyph": g};
        string += String.fromCharCode(u);
        text.showGlyph(f, m, g, u, v);
        m = advanceMatrix(m, f, g, v);
    }
    return {"text": text, "string": string, "replacements": replacements, "distance": distance(m, glyphs[glyphs.length-1].nextMatrix)};
}

function anonymizeChunk(glyphs, ctm) {
    var attempts = 0;
    var tolerance = GlyphReplacementTolerance * Math.abs(glyphs[0].matrix[0]);
    var original = "";
    for (var i = 0; i < glyphs.length; ++i) {
        original += String.fromCharCode(glyphs[i].unicode);
    }
    print("Replacing", original, "(tolerance:", tolerance + ")");
    while (true) {
        attempts++;
        var generated = generateText(glyphs, ctm);
        print(original, " -> ", generated.string, "(" + generated.distance + ")");
        if (generated.distance <= tolerance) {
            for (var k in generated.replacements) {
                Replacements[k] = generated.replacements[k];
            }
            print("attempts:", attempts);
            print("\n");
            return generated.text;
        }
        if (attempts % (BackOffFrequency * glyphs.length) == 0) {
            tolerance *= BackOffAmount;
            print("increasing tolerance to", tolerance);
        }
    }
}

function anonymizeText(text, ctm) {
    var anonymizedText = new Text();
    var chunks = splitText(text);
    for (var i = 0; i < chunks.length; ++i) {
        anonymizeChunk(chunks[i], ctm).walk(anonymizedText);
    }
    return anonymizedText;
}

// We cannot use inheritence to extend DrawDevice, since it is a native
// class. Instead, we use composition to override the text functions.

function AnonymizingDrawDevice(transform, pixmap) {
    this.dd = DrawDevice(transform, pixmap);
    this.fillText = function(text, ctm, colorSpace, color, alpha) {
        text = anonymizeText(text, ctm);
        return this.dd.fillText(text, ctm, colorSpace, color, alpha);
    };
    this.clipText = function(text, ctm) {
        text = anonymizeText(text, ctm);
        return this.dd.clipText(text, ctm);
    };
    this.strokeText = function(text, stroke, ctm, colorSpace, color, alpha) {
        text = anonymizeText(text, ctm);
        return this.dd.strokeText(text, stroke, ctm, colorSpace, color, alpha);
    };
    this.clipStrokeText = function(text, stroke, ctm) {
        text = anonymizeText(text, ctm);
        return this.dd.clipStrokeText(text, stroke, ctm);
    };
    this.ignoreText = function(text, ctm) {
        text = anonymizeText(text, ctm);
        return this.dd.ignoreText(text, ctm);
    };
    this.fillPath = function(path, evenOdd, ctm, colorSpace, color, alpha) {
        return this.dd.fillPath(path, evenOdd, ctm, colorSpace, color, alpha);
    };
    this.clipPath = function(path, evenOdd, ctm) {
        return this.dd.clipPath(path, evenOdd, ctm);
    };
    this.strokePath = function(path, stroke, ctm, colorSpace, color, alpha) {
        return this.dd.strokePath(path, stroke, ctm, colorSpace, color, alpha);
    };
    this.clipStrokePath = function(path, stroke, ctm) {
        return this.dd.clipStrokePath(path, stroke, ctm);
    };
    this.fillShade = function(shade, ctm, alpha) {
        return this.dd.fillShade(shade, ctm, alpha);
    };
    this.fillImage = function(image, ctm, alpha) {
        return this.dd.fillImage(image, ctm, alpha);
    };
    this.fillImageMask = function(image, ctm, colorSpace, color, alpha) {
        return this.dd.fillImageMask(image, ctm, colorSpace, color, alpha);
    };
    this.clipImageMask = function(image, ctm) {
        return this.dd.clipImageMask(image, ctm);
    };
    this.beginMask = function(area, luminosity, colorspace, color) {
        return this.dd.beginMask(area, luminosity, colorspace, color);
    };
    this.endMask = function() {
        return this.dd.endMask();
    };
    this.popClip = function() {
        return this.dd.popClip();
    };
    this.beginGroup = function(area, isolated, knockout, blendmode, alpha) {
        return this.dd.beginGroup(area, isolated, knockout, blendmode, alpha);
    };
    this.endGroup = function() {
        return this.dd.endGroup();
    };
    this.beginTile = function(area, view, xstep, ystep, ctm, id) {
        return this.dd.beginTile(area, view, xstep, ystep, ctm, id);
    };
    this.endTile = function() {
        return this.dd.endTile();
    };
    this.close = function() {
        return this.dd.close();
    };
}
var anonymizingDevice = new AnonymizingDrawDevice(Identity, pixmap);
page.run(anonymizingDevice, scaleMatrix);
pixmap.saveAsPNG(scriptArgs[2]);

for (var k in Replacements) {
    var r = Replacements[k];
    var p = new Path();
    p.moveTo(r.vertices[r.vertices.length-1][0], r.vertices[r.vertices.length-1][1])
    for (var j = 0; j < r.vertices.length; ++j) {
        var x = r.vertices[j][0];
        var y = r.vertices[j][1];
        p.lineTo(x, y);
    }
    anonymizingDevice.fillPath(p, true, Identity, DeviceRGB, r.color, 0.3);
}

pixmap.saveAsPNG(scriptArgs[2].replace(".png", ".info.png"));
anonymizingDevice.close()
