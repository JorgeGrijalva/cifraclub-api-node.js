const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');

const CIFRACLUB_URL = "https://www.cifraclub.com.br/";
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Utilidades para transposición
const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAPA_NOTAS = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

function transponerAcorde(acorde, semitonos) {
    if (!acorde) return acorde;
    const match = acorde.match(/^([A-G][b#]?)(.*)/);
    if (!match) return acorde;

    const notaBase = match[1];
    const resto = match[2];

    if (MAPA_NOTAS[notaBase] === undefined) return acorde;

    let nuevoIndice = (MAPA_NOTAS[notaBase] + semitonos) % 12;
    if (nuevoIndice < 0) nuevoIndice += 12;

    return NOTAS[nuevoIndice] + resto;
}

class CifraClub {
    constructor() {
        this.session = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });
    }

    async cifra(artist, song, opciones = {}) {
        const cacheKey = `${artist}-${song}`;
        let result = myCache.get(cacheKey);

        if (!result) {
            result = await this.scrape(artist, song);
            if (!result.error) myCache.set(cacheKey, result);
        } else {
            result = { ...result, fromCache: true };
        }

        // Aplicar transposición si se solicita
        if (opciones.tono && result.tono && !result.error) {
            result = this.aplicarTransposicion(result, opciones.tono);
        }

        // Aplicar capo si se solicita
        if (opciones.capo && !result.error) {
            result.capo_solicitado = opciones.capo;
        }

        return result;
    }

    async scrape(artist, song) {
        const result = {
            artista: artist,
            nombre: song,
            url_cifraclub: `${CIFRACLUB_URL}${artist}/${song}`,
            error: null,
            fromCache: false
        };

        try {
            const response = await this.session.get(result.url_cifraclub, {
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            });

            const $ = cheerio.load(response.data);
            this.getDetails(result, $);
            this.getCifra(result, $);
        } catch (e) {
            result.error = `Error al conectar con CifraClub: ${e.message}`;
        }
        return result;
    }

    getDetails(result, $) {
        try {
            result.nombre = $('h1.t1').text().trim() || result.nombre;
            result.artista = $('h2.t3').text().trim() || result.artista;
            result.tono = $('#cifra_tom a').text().trim();
            result.capo = $('#cifra_capo a').text().trim();

            const playerPlaceholder = $('div.player-placeholder img').attr('src');
            if (playerPlaceholder && playerPlaceholder.includes('/vi/')) {
                const cod = playerPlaceholder.split('/vi/')[1].split('/')[0];
                result.url_youtube = `https://www.youtube.com/watch?v=${cod}`;
            }
        } catch (e) {
            if (!result.error) result.error = `Error al obtener detalles: ${e.message}`;
        }
    }

    getCifra(result, $) {
        try {
            let core = $('div.cifra_cnt');
            if (!core.length) core = $('pre.js-tab-content');

            if (core.length) {
                let pre = core.find('pre');
                if (!pre.length) pre = core;

                result.letra_html = pre.html();
                result.letra = pre.text().split('\n');
            } else {
                result.error = "Contenido de la cifra no encontrado";
            }
        } catch (e) {
            if (!result.error) result.error = `Error al obtener la cifra: ${e.message}`;
        }
    }

    aplicarTransposicion(result, nuevoTono) {
        const final = JSON.parse(JSON.stringify(result));

        if (MAPA_NOTAS[final.tono] === undefined || MAPA_NOTAS[nuevoTono] === undefined) {
            return final;
        }

        const semitonos = MAPA_NOTAS[nuevoTono] - MAPA_NOTAS[final.tono];
        if (semitonos === 0) return final;

        const $ = cheerio.load(`<pre>${final.letra_html}</pre>`);
        $('b').each((i, el) => {
            const original = $(el).text();
            $(el).text(transponerAcorde(original, semitonos));
        });

        final.letra_html = $('pre').html();
        final.letra = $('pre').text().split('\n');
        final.tono = nuevoTono;
        final.transposicion = `${semitonos > 0 ? '+' : ''}${semitonos} semitonos`;

        return final;
    }
}

const cifraClub = new CifraClub();

function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').trim();
}

/**
 * @swagger
 * /api/cifra:
 *   get:
 *     summary: Obtiene la cifra (acordes/letra) traducida y mejorada
 *     parameters:
 *       - in: query
 *         name: artist
 *         type: string
 *         required: true
 *       - in: query
 *         name: song
 *         type: string
 *         required: true
 *       - in: query
 *         name: tono
 *         type: string
 *         description: Tono objetivo (ej. G, A, C#)
 *       - in: query
 *         name: capo
 *         type: integer
 *         description: Traste del capo (ej. 1, 2)
 */
module.exports = async (req, res) => {
    const { artist, song, tono, capo } = req.query;

    if (!artist || !song) {
        return res.status(400).json({ error: "Parámetros 'artist' y 'song' obligatorios." });
    }

    try {
        const result = await cifraClub.cifra(sanitizeInput(artist), sanitizeInput(song), { tono, capo });

        if (result.error && !result.letra) {
            return res.status(404).json(result);
        }

        delete result.letra_html;
        result.timestamp = new Date().toISOString();
        res.status(200).json(result);
    } catch (e) {
        res.status(500).json({ error: `Error: ${e.message}` });
    }
};