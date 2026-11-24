import unittest
from PIL import Image
from visual_compare import repeat_comparison

class PixelGateTests(unittest.TestCase):
    def test_identical(self):
        image=Image.new('RGB',(30,30),(100,100,100))
        self.assertTrue(repeat_comparison(image,image)['identical'])
    def test_six_single_level_raster_pixels_are_recorded(self):
        image=Image.new('RGB',(30,30),(100,100,100));other=image.copy()
        for x in range(6):other.putpixel((x,0),(100,101,100))
        result=repeat_comparison(image,other)
        self.assertEqual(result['changedPixels'],6);self.assertFalse(result['identical']);self.assertTrue(result['accepted'])
    def test_two_level_color_change_fails(self):
        image=Image.new('RGB',(30,30),(100,100,100));other=image.copy();other.putpixel((0,0),(102,100,100))
        self.assertFalse(repeat_comparison(image,other)['accepted'])
    def test_seventeen_changed_pixels_fail(self):
        image=Image.new('RGB',(30,30),(100,100,100));other=image.copy()
        for x in range(17):other.putpixel((x,0),(101,100,100))
        self.assertFalse(repeat_comparison(image,other)['accepted'])
    def test_dimension_change_fails(self):
        self.assertFalse(repeat_comparison(Image.new('RGB',(30,30)),Image.new('RGB',(30,31)))['accepted'])
if __name__=='__main__':unittest.main()
