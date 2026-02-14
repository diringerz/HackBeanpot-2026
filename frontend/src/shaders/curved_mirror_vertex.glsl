// ============================================================================
// CURVED MIRROR — Vertex Shader (fullscreen quad)
// ============================================================================
// This simply passes through a fullscreen triangle/quad.
// The real work happens in the fragment shader.

attribute vec2 a_position; // expected: [-1, -1] to [1, 1] quad

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}
