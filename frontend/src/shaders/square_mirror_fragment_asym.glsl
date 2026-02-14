// ============================================================================
// CURVED MIRROR — Asymmetric Extruded Profile Fragment Shader
// ============================================================================
//
// The mirror is a rectangle with a curved cross-section along the Y axis,
// extruded flat along X. The profile can be fully asymmetric — the top half
// of the mirror can have a completely different curve than the bottom half.
//
//   Side view (YZ plane):           Top view (XY plane):
//
//   z ▲                              y ▲
//     │      ╭──╮                      │ ┌──────────┐
//     │     ╱    ╲                     │ │          │
//     │   ╱       ╲                    │ │  mirror  │  ← flat
//     │  ╱         ╲                   │ │          │
//     │ ╱    ← asymmetric!             │ └──────────┘
//     │╱                               └────────────▶ x
//     └──────────────────▶ y
//     -halfH            +halfH
//
// MATH:
//   Surface: z(x,y) = g(y) = a·y² + b·y + c   (per segment, in y-space)
//
//   Ray: y(t) = oy + t·dy  (LINEAR in t)
//
//   Substituting into surface equation:
//     a·(oy+t·dy)² + b·(oy+t·dy) + c + mirrorDist = oz + t·dz
//
//   This is a QUADRATIC in t. No quartic needed. Each segment is a single
//   quadratic formula — the cheapest possible analytical intersection.
//
// Segments span y ∈ [yMin, yMax] covering the full range [-halfH, +halfH].
// Packed as vec4(a, b, c, yMin). yMax = next segment's yMin, or +halfH.
//
// SCENE LAYOUT:
//   Camera at origin, looking +Z.
//   Mirror at z ≈ u_mirrorDist + profile.
//   Image plane (webcam) at z = -u_imagePlaneDist.
//
// ============================================================================

precision highp float;

#define MAX_SEGMENTS 16

// --- Uniforms ---

uniform sampler2D u_webcamTex;
uniform vec2  u_resolution;

uniform float u_mirrorDist;
uniform float u_mirrorHalfWidth;   // half-extent along X (flat axis)
uniform float u_mirrorHalfHeight;  // half-extent along Y (profile axis)

// Segment data: vec4(a, b, c, yMin) per segment.
// Each segment defines z(y) = a·y² + b·y + c for y ∈ [yMin, yMax].
// yMax of segment i = yMin of segment i+1.
// yMax of last segment = +u_mirrorHalfHeight.
// yMin of first segment should be -u_mirrorHalfHeight.
uniform vec4  u_segments[MAX_SEGMENTS];
uniform int   u_numSegments;

uniform float u_imagePlaneDist;
uniform vec2  u_imageSize;

uniform float u_fov;


// ============================================================================
// PER-SEGMENT INTERSECTION — Quadratic
// ============================================================================
//
// Surface: z = a·y² + b·y + c + mirrorDist
// Ray: P(t) = O + t·D, so y(t) = oy + t·dy, z(t) = oz + t·dz
//
// Setting equal:
//   a·(oy + t·dy)² + b·(oy + t·dy) + c + mirrorDist = oz + t·dz
//
// Expand:
//   a·dy²·t² + (2a·oy·dy + b·dy)·t + (a·oy² + b·oy + c + mirrorDist) = oz + t·dz
//
// Rearrange:
//   (a·dy²)·t² + (2a·oy·dy + b·dy - dz)·t + (a·oy² + b·oy + c + mirrorDist - oz) = 0
//    ^^^^^^       ^^^^^^^^^^^^^^^^^^^^^^^^^     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//      qA                   qB                                  qC

float intersectSegment(
    float a, float b_coeff, float c_coeff,
    float yMin, float yMax,
    vec3 ro, vec3 rd
) {
    float qA = a * rd.y * rd.y;
    float qB = 2.0 * a * ro.y * rd.y + b_coeff * rd.y - rd.z;
    float qC = a * ro.y * ro.y + b_coeff * ro.y + c_coeff + u_mirrorDist - ro.z;

    float t = -1.0;

    if (abs(qA) < 1e-10) {
        // Linear: qB·t + qC = 0
        if (abs(qB) < 1e-10) return -1.0;
        t = -qC / qB;
        if (t < 0.001) return -1.0;
    } else {
    float disc = qB * qB - 4.0 * qA * qC;
    if (disc < 0.0) return -1.0;

    float sq = sqrt(disc);
    float t1 = (-qB - sq) / (2.0 * qA);
    float t2 = (-qB + sq) / (2.0 * qA);

        // Pick smallest positive root
    float tMin = min(t1, t2);
    float tMax = max(t1, t2);
        t = (tMin > 0.001) ? tMin : ((tMax > 0.001) ? tMax : -1.0);
    }

    if (t < 0.0) return -1.0;

    // Validate: y at hit must be within this segment's domain
    float hitY = ro.y + rd.y * t;
    if (hitY < yMin || hitY > yMax) {
        // First root was out of domain — try the other root
        float disc = qB * qB - 4.0 * qA * qC;
        if (disc < 0.0 || abs(qA) < 1e-10) return -1.0;
        float sq = sqrt(disc);
        float t1 = (-qB - sq) / (2.0 * qA);
        float t2 = (-qB + sq) / (2.0 * qA);
        // Try the other root
        float tOther = (t == min(t1, t2)) ? max(t1, t2) : min(t1, t2);
        if (tOther < 0.001) return -1.0;
        float hitY2 = ro.y + rd.y * tOther;
        if (hitY2 < yMin || hitY2 > yMax) return -1.0;
        t = tOther;
    }

    return t;
}


// ============================================================================
// SURFACE NORMAL
// ============================================================================
//
// z(x,y) = a·y² + b·y + c + mirrorDist
//
//   dz/dx = 0           (flat along X)
//   dz/dy = 2a·y + b    (profile derivative)
//
// Surface: F(x,y,z) = z - a·y² - b·y - c - mirrorDist = 0
// ∇F = (0, -(2a·y + b), 1)
// Negate to face camera → (0, 2a·y + b, -1)

vec3 computeNormal(float hitY, float a, float b_coeff) {
    float dzdy = 2.0 * a * hitY + b_coeff;
    return normalize(vec3(0.0, dzdy, -1.0));
}


// ============================================================================
// MAIN
// ============================================================================

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 ndc = uv * 2.0 - 1.0;

    float aspect = u_resolution.x / u_resolution.y;
    ndc.x *= aspect;

    // Camera ray
    float fovScale = tan(u_fov * 0.5);
    vec3 ro = vec3(0.0);
    vec3 rd = normalize(vec3(ndc * fovScale, 1.0));

    // --- Test all segments, keep nearest hit ---
    float bestT = 1e20;
    int   bestSeg = -1;

    for (int i = 0; i < MAX_SEGMENTS; i++) {
        if (i >= u_numSegments) break;

        vec4 seg = u_segments[i];
        float a       = seg.x;
        float b_coeff = seg.y;
        float c_coeff = seg.z;
        float yMin    = seg.w;

        // yMax: next segment's yMin, or +halfHeight for last segment
        float yMax;
        if (i + 1 < u_numSegments) {
            yMax = u_segments[i + 1].w;
        } else {
            yMax = u_mirrorHalfHeight;
        }

        float t = intersectSegment(a, b_coeff, c_coeff,
                                   yMin, yMax, ro, rd);

        if (t > 0.0 && t < bestT) {
            vec3 p = ro + rd * t;
            // Validate rectangular bounds (X is the flat axis)
            if (abs(p.x) <= u_mirrorHalfWidth) {
                bestT = t;
                bestSeg = i;
            }
        }
    }

    // --- No hit ---
    if (bestSeg < 0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec3 hitPos = ro + rd * bestT;

    // --- Retrieve winning segment coefficients ---
    float segA = 0.0;
    float segB = 0.0;
    for (int i = 0; i < MAX_SEGMENTS; i++) {
        if (i == bestSeg) {
            segA = u_segments[i].x;
            segB = u_segments[i].y;
            break;
        }
    }

    // --- Normal ---
    vec3 N = computeNormal(hitPos.y, segA, segB);

    // --- Reflect ---
    vec3 reflDir = reflect(rd, N);

    if (reflDir.z >= 0.0) {
        gl_FragColor = vec4(0.03, 0.03, 0.05, 1.0);
        return;
    }

    // --- Intersect with image plane at z = -u_imagePlaneDist ---
    float tImg = (-u_imagePlaneDist - hitPos.z) / reflDir.z;
    vec3 imgHit = hitPos + reflDir * tImg;

    vec2 imgUV = imgHit.xy / u_imageSize + 0.5;
    imgUV.x = 1.0 - imgUV.x;
    imgUV.y = 1.0 - imgUV.y;  // Flip Y to match webcam texture orientation

    if (imgUV.x < 0.0 || imgUV.x > 1.0 || imgUV.y < 0.0 || imgUV.y > 1.0) {
        gl_FragColor = vec4(0.02, 0.02, 0.03, 1.0);
        return;
    }

    vec4 texColor = texture2D(u_webcamTex, imgUV);

    // Edge fade along rectangle boundary
    float edgeX = abs(hitPos.x) / u_mirrorHalfWidth;
    float edgeY = abs(hitPos.y) / u_mirrorHalfHeight;
    float edgeFade = smoothstep(1.0, 0.92, max(edgeX, edgeY));

    // Fresnel
    float fresnel = 0.85 + 0.15 * pow(1.0 - abs(dot(normalize(-rd), N)), 2.0);

    gl_FragColor = vec4(texColor.rgb * edgeFade * fresnel, 1.0);
}
