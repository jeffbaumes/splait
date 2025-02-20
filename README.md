# Splait

A gaussian splatted interactive world.

# Live demo

https://splait.pages.dev

**Note: requires a browser with WebGPU support**

<img width="2010" alt="Screenshot 2025-02-19 at 7 44 30 PM" src="https://github.com/user-attachments/assets/2204a0c3-ef8d-44cb-8759-795bf87618da" />

<img width="1707" alt="Screenshot 2025-02-19 at 8 02 18 PM" src="https://github.com/user-attachments/assets/e54ac592-8e7a-463f-b02e-babef3636d7e" />

# Features

- Everything in the world is a gaussian
- Player collides with gaussians
- Walk near leaves to have them fall and collide with the ground and each other
- Physics simulation is limited to a radius around the player
- Scroll the mousewheel to change your brush size, highlighted in yellow
- Left-click to destroy
- Right-click to build (one white gaussian at a time)
- Press T to turn on the day/night cycle
- Press M to switch between flat and gaussian shading
- Press P to switch between normal and fly mode
- +/- keys change rendering resolution

# Todo

- [ ] Different brushes
- [ ] Generate as you move around the world
- [ ] Clouds
- [ ] Rain, snow
- [ ] Multiplayer
- [ ] Decrease what is stored per gaussian
- [ ] Don't allow particles to overlap when simulating, fill out space

# Done

- [x] Redo place
- [x] Player physics
- [x] Keep world.gaussianList up to date for player physics and take/place
- [x] Player affects objects, can push them around (special gaussian that can is sent to sim each time)
- [x] Redo take
- [x] Better trees
- [x] Take larger chunks of items

# Maybe

- [ ] Fix dark/light bands on edges of hills
