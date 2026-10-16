using UnityEngine;

namespace IsolatedVillage.Utils
{
    /// <summary>
    /// Generates crisp procedural 2D sprites at runtime or in editor:
    /// - Character capsule body
    /// - Character visor
    /// - Cobblestone ground texture
    /// - Campfire flame icon
    /// - Radial light falloff cookie for URP 2D Light2D
    /// </summary>
    public static class ProceduralSpriteGenerator
    {
        public static Sprite CreateCapsuleSprite(int width = 64, int height = 96, Color color = default)
        {
            if (color == default) color = Color.white;
            Texture2D tex = new Texture2D(width, height, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;

            float radius = width * 0.5f;
            Vector2 topCenter = new Vector2(radius, height - radius);
            Vector2 bottomCenter = new Vector2(radius, radius);

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    Vector2 pt = new Vector2(x + 0.5f, y + 0.5f);
                    bool inside = false;

                    if (y >= bottomCenter.y && y <= topCenter.y)
                    {
                        inside = (x >= 0 && x <= width);
                    }
                    else if (y > topCenter.y)
                    {
                        inside = Vector2.Distance(pt, topCenter) <= radius;
                    }
                    else if (y < bottomCenter.y)
                    {
                        inside = Vector2.Distance(pt, bottomCenter) <= radius;
                    }

                    tex.SetPixel(x, y, inside ? color : Color.clear);
                }
            }
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, width, height), new Vector2(0.5f, 0.5f), 32);
        }

        public static Sprite CreateRadialLightCookie(int size = 256)
        {
            Texture2D tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            Vector2 center = new Vector2(size * 0.5f, size * 0.5f);
            float radius = size * 0.5f;

            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dist = Vector2.Distance(new Vector2(x, y), center);
                    float t = Mathf.Clamp01(dist / radius);
                    float alpha = Mathf.SmoothStep(1f, 0f, t);
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, alpha));
                }
            }
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 32);
        }
    }
}
