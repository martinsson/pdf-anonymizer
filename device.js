var glyph = require("glyph");

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

// The AnonymizingDevice extends the builtin DrawDevice. For each of the text
// methods, the AnonymizingDevice replaces the original text based on the
// characterMap, characterWhitelist, and zoneWhitelist.

function AnonymizingDevice(pixmap, characterMap, characterWhitelist, zoneWhitelist, maskImages, wordsToAnonymizeFile) {

    var stopWords = read("./stopwords.txt").split('\n')
    var wordsToAnonymize = read(wordsToAnonymizeFile).split('\n')
        .filter(function (r) {
            return stopWords.indexOf(r) === -1})
        .filter(function (r) {
            return r.indexOf("//") === -1})
        .map(function (r) {
            return r.toLowerCase()
        })
    wordsToAnonymize = wordsToAnonymize.concat(wordsToAnonymize.map(function (w) {
        return w.replace(/ /g, "")
    }))

    this.dd = DrawDevice(Identity, pixmap);
    this.characterMap = characterMap;
    this.characterWhitelist = characterWhitelist;
    this.zoneWhitelist = zoneWhitelist;
    this.replacements = {};

    if (maskImages === undefined) {
        maskImages = true;
    }
    this.maskImages = maskImages;

    function flatten(subChunks) {
        if (!subChunks) {
            return [];
        }
        return subChunks.reduce(function (acc, cur) {return acc.concat(cur)}, [] )
    }

    function getChunksOfLength(chunks, currentPos, length) {
        var result = []
        while (result.length < length && chunks.length > currentPos) {
            var glyphs = chunks[currentPos]
            for (var i = 0; i < glyphs.length; i++) {
                var glyph = glyphs[i]
                result.push(glyph)
            }
            // print('result length ', result.length, ' currentpos ', currentPos)
            currentPos++
        }

        return [result, currentPos];
    }

    function wordToAnonymize(chunks, currentPos, wordsToAnonymize) {

        print('========== handling chunk ', glyphsToString(chunks[currentPos]))

        for (var i = 0; i < wordsToAnonymize.length; i++) {
            var word = wordsToAnonymize[i]
            print('testing match for word ', word)

            var spannedGlyps = getChunksOfLength(chunks, currentPos, word.length)[0]

            var spannedWord = glyphsToString(spannedGlyps)
            print('candidate spanned word ', spannedWord)
            var isWordToAnonymize = spannedWord.toLowerCase().indexOf(word) === 0;
            if (isWordToAnonymize) {
                return word;
            }
        }
        for (var i = 0; i < wordsToAnonymize.length; i++) {
            var word = wordsToAnonymize[i]
            var singleChunk = chunks[currentPos];
            var spannedWord = glyphsToString(singleChunk)
            var isWordToAnonymize = spannedWord.toLowerCase() === word;
            if (isWordToAnonymize) {
                return word;
            }
        }

        return undefined
    }

    this.anonymizeText = function (text, ctm) {
        var glyphs = this.textToGlyphs(text, ctm);
        var chunks = this.tokenize(glyphs);
        print("chunk length", flatten(chunks).length)
        print("full text of block", glyphsToString(flatten(chunks)))
        var anonymizedText = new Text();
        for (var i = 0; i < chunks.length; ) {

            var anonymized;
            var word = wordToAnonymize(chunks, i, wordsToAnonymize);
            if (word) {
                var result = getChunksOfLength(chunks, i, word.length)
                var subChunks = result[0]
                anonymized = this.anonymize(flatten(subChunks));

                var anonymizedString = glyphsToString(flatten(subChunks));
                print('replacing spanned', anonymizedString);
                print('before', i);
                i = result[1];
                print('after', i);

            } else  {
                anonymized = chunks[i];
                print('keeping', glyphsToString(chunks[i]));
                i++
            }
            var textChunk = anonymized;
            this.glyphsToText(textChunk).walk(anonymizedText);
        }
        return anonymizedText;
    };

    this.textToGlyphs = function(text, ctm) {
        var glyphs = [];
        text.walk({
            showGlyph: function (f, m, g, u, v) {
                m = new glyph.GlyphMatrix(m);
                glyphs.push(new glyph.Glyph(f, m, g, u, v, ctm, 0));
            }
        });
        return glyphs;
    };

    this.glyphsToText = function(glyphs) {
        var text = new Text();
        for (var i = 0; i < glyphs.length; ++i) {
            var g = glyphs[i];
            text.showGlyph(g.font, g.matrix.m, g.glyph, g.unicode, g.wmode);
        }
        return text;
    };

    this.tokenize = function(glyphs) {
        var chunks = [];
        var chunk = [];
        for (var i = 0; i < glyphs.length; ++i) {
            var curr = glyphs[i];
            if (chunk.length > 0) {
                var last = chunk[chunk.length-1];
                if (!curr.succeeds(last, this.characterWhitelist)) {
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
            chunks[i] = kernGlyphs(chunks[i]);
        }
        return chunks;
    };

    function shouldBeKept(original) {
        return wordsToAnonymize.indexOf(original.trim().toLowerCase()) === -1
    }

    function glyphsToString(glyphs) {
        var original = ""
        for (var i = 0; i < glyphs.length; ++i) {
            original += glyphs[i].string
        }
        return original
    }

    this.anonymize = function(glyphs) {
        var attempts = 0;
        var tolerance = GlyphReplacementTolerance * glyphs[0].size;
        var original = glyphsToString(glyphs)
        // if (shouldBeKept(original)) {
        //     print("not replacing " + original)
        //     return glyphs;
        // }
        print("replacing " + JSON.stringify(original) + " (tolerance: " + tolerance.toFixed(1) + ")");
        while (true) {
            attempts++;
            var candidate = this.randomize(glyphs);
            var candidateDistance = candidate[candidate.length-1].nextMatrix.distance(glyphs[glyphs.length-1].nextMatrix);
            var candidateString = "";
            for (var i = 0; i < candidate.length; ++i) {
                candidateString += candidate[i].string;
            }
            print(JSON.stringify(original) + " -> " + JSON.stringify(candidateString) + " (" + candidateDistance.toFixed(1) + ")");
            if (candidateDistance <= tolerance) {
                for (var i = 0; i < candidate.length; ++i) {
                    this.replacements[glyphs[i]] = candidate[i];
                }
                print("attempts: " + attempts + "\n");
                return candidate;
            }
            if (attempts % (BackOffFrequency * glyphs.length) == 0) {
                tolerance *= BackOffAmount;
                print("increasing tolerance to " + tolerance.toFixed(1));
            }
        }
    };

    this.randomize = function(glyphs) {
        var replacements = [];
        for (var i = 0; i < glyphs.length; ++i) {
            var r;
            if (glyphs[i] in this.replacements) {
                r = this.replacements[glyphs[i]];
            } else {
                r = glyphs[i];
                if (i > 0) {
                    r = r.placeAfter(replacements[i-1]);
                }
                r = r.randomize(this.characterMap, this.characterWhitelist, this.zoneWhitelist);
            }
            replacements.push(r);
        }
        return replacements;
    };

    this.fillText = function(text, ctm, colorSpace, color, alpha) {
        text = this.anonymizeText(text, ctm);
        return this.dd.fillText(text, ctm, colorSpace, color, alpha);
    };
    this.clipText = function(text, ctm) {
        text = this.anonymizeText(text, ctm);
        return this.dd.clipText(text, ctm);
    };
    this.strokeText = function(text, stroke, ctm, colorSpace, color, alpha) {
        text = this.anonymizeText(text, ctm);
        return this.dd.strokeText(text, stroke, ctm, colorSpace, color, alpha);
    };
    this.clipStrokeText = function(text, stroke, ctm) {
        text = this.anonymizeText(text, ctm);
        return this.dd.clipStrokeText(text, stroke, ctm);
    };
    this.ignoreText = function(text, ctm) {
        text = this.anonymizeText(text, ctm);
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
        if (this.maskImages) {
            var pixmap = image.toPixmap();
            pixmap.clear(100);
            image = new Image(pixmap);
        }
        return this.dd.fillImage(image, ctm, alpha);
    };
    this.fillImageMask = function(image, ctm, colorSpace, color, alpha) {
        if (this.maskImages) {
            var pixmap = image.toPixmap();
            pixmap.clear(100);
            image = new Image(pixmap);
        }
        return this.dd.fillImageMask(image, ctm, colorSpace, color, alpha);
    };
    this.clipImageMask = function(image, ctm) {
        if (this.maskImages) {
            var pixmap = image.toPixmap();
            pixmap.clear(100);
            image = new Image(pixmap);
        }
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

function determineKerning(font, glyph, wmode, matrix, nextMatrix) {
    var tx = 0, ty = 0;
    var adv = font.advanceGlyph(glyph, wmode);
    if (wmode == 0) {
        if (matrix[0] != 0) {
            tx = (nextMatrix[4] - matrix[4])/matrix[0];
        } else if (matrix[1] != 0) {
            tx = (nextMatrix[5] - matrix[5])/matrix[1];
        } else {
            tx = adv;
        }
        return tx - adv;
    } else {
        if (matrix[2] != 0) {
            ty = (nextMatrix[4] - matrix[4])/matrix[2];
        } else if (matrix[3] != 0) {
            ty = (nextMatrix[5] - matrix[5])/matrix[3];
        } else {
            ty = -adv;
        }
        return ty - -adv;
    }
}

function kernGlyphs(glyphs) {
    var kernedGlyphs = [];
    for (var i = 0; i < glyphs.length; ++i) {
        var kern = 0;
        if (i < glyphs.length - 1) {
            kern = determineKerning(glyphs[i].font, glyphs[i].glyph, glyphs[i].wmode, glyphs[i].matrix.m, glyphs[i+1].matrix.m);
        }
        kernedGlyphs.push(glyphs[i].withKerning(kern));
    }
    return kernedGlyphs;
}

exports.AnonymizingDevice = AnonymizingDevice;
